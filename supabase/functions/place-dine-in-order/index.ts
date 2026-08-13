import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";
import { requireCustomer } from "../_shared/customer-guard.ts";

type ItemInput = { product_id: string; quantity: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, serviceClient } = await requireCustomer(req);
    const body = await req.json().catch(() => ({}));
    const table_id = String(body.table_id ?? "");
    const items = (Array.isArray(body.items) ? body.items : []) as ItemInput[];

    if (!table_id || items.length === 0) {
      return new Response(JSON.stringify({ error: "table_id and at least one item are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: table, error: tableError } = await serviceClient
      .from("tables")
      .select("id, restaurant_id")
      .eq("id", table_id)
      .maybeSingle();
    if (tableError) throw tableError;
    if (!table) {
      return new Response(JSON.stringify({ error: "Mesa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preço NUNCA vem do client — recalcula a partir de products.price, e só
    // aceita product_id que realmente pertence ao restaurante da mesa e está ativo.
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const { data: products, error: productsError } = await serviceClient
      .from("products")
      .select("id, price")
      .eq("restaurant_id", table.restaurant_id)
      .eq("active", true)
      .in("id", productIds);
    if (productsError) throw productsError;

    const priceById = new Map((products ?? []).map((p) => [p.id, Number(p.price)]));
    const invalidIds = productIds.filter((id) => !priceById.has(id));
    if (invalidIds.length > 0) {
      return new Response(
        JSON.stringify({ error: "Um ou mais itens não estão disponíveis neste restaurante", invalid_product_ids: invalidIds }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const orderItems = items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: priceById.get(item.product_id)!,
    }));
    const total = orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    // Acha a sessão aberta da mesa ou cria uma — o índice único
    // table_sessions_one_open_per_table (migration 0008) garante que duas
    // tentativas concorrentes não criem duas comandas pra mesma mesa.
    let sessionId: string;
    const { data: newSession, error: insertSessionError } = await serviceClient
      .from("table_sessions")
      .insert({ table_id, status: "open" })
      .select("id")
      .single();

    if (insertSessionError) {
      if (insertSessionError.code !== "23505") throw insertSessionError;
      const { data: existingSession, error: existingSessionError } = await serviceClient
        .from("table_sessions")
        .select("id")
        .eq("table_id", table_id)
        .eq("status", "open")
        .single();
      if (existingSessionError) throw existingSessionError;
      sessionId = existingSession.id;
    } else {
      sessionId = newSession.id;
    }

    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .insert({
        restaurant_id: table.restaurant_id,
        customer_id: user.id,
        order_type: "dine_in",
        status: "received",
        table_session_id: sessionId,
        payment_status: "pending",
        subtotal: total,
        total,
      })
      .select("id")
      .single();
    if (orderError) throw orderError;

    const { error: itemsError } = await serviceClient
      .from("order_items")
      .insert(orderItems.map((item) => ({ ...item, order_id: order.id })));
    if (itemsError) throw itemsError;

    await serviceClient.from("restaurants").update({ last_order_at: new Date().toISOString() }).eq("id", table.restaurant_id);

    return new Response(JSON.stringify({ order_id: order.id, table_session_id: sessionId, total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: serializeError(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
