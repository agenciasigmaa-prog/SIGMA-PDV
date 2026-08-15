import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";
import { requireRestaurantStaff } from "../_shared/customer-guard.ts";

type RequestBody = {
  order_id?: string;
  action?: "add_item" | "remove_item" | "set_notes" | "set_discount" | "set_service_charge";
  product_id?: string;
  quantity?: number;
  notes?: string;
  order_item_id?: string;
  discount_amount?: number;
  service_charge_amount?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { serviceClient, restaurantId } = await requireRestaurantStaff(req);
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const orderId = String(body.order_id ?? "");
    if (!orderId) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pedido precisa pertencer ao MESMO restaurante do staff logado — nunca
    // confia em restaurant_id vindo do client, só no que veio do profile.
    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .select("id, restaurant_id, subtotal, discount_amount, service_charge_amount")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.restaurant_id !== restaurantId) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "set_notes") {
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      const { error } = await serviceClient
        .from("orders")
        .update({ notes: notes || null })
        .eq("id", orderId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.action === "add_item") {
      const productId = String(body.product_id ?? "");
      const quantity = Number(body.quantity ?? 0);
      if (!productId || !Number.isInteger(quantity) || quantity < 1) {
        return new Response(JSON.stringify({ error: "product_id e quantity (inteiro >= 1) são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Preço sempre vem do banco, nunca do client — mesma disciplina do
      // place-dine-in-order. Sem adicional/combo/meio a meio nesta ação (mesma
      // simplificação já assumida no ManualOrderModal).
      const { data: product, error: productError } = await serviceClient
        .from("products")
        .select("id, price")
        .eq("id", productId)
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .eq("sold_out", false)
        .maybeSingle();
      if (productError) throw productError;
      if (!product) {
        return new Response(JSON.stringify({ error: "Produto não disponível" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const itemNotes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
      const { error: insertError } = await serviceClient.from("order_items").insert({
        order_id: orderId,
        product_id: product.id,
        quantity,
        unit_price: Number(product.price),
        notes: itemNotes,
      });
      if (insertError) throw insertError;
    } else if (body.action === "remove_item") {
      const orderItemId = String(body.order_item_id ?? "");
      if (!orderItemId) {
        return new Response(JSON.stringify({ error: "order_item_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: deleteError } = await serviceClient
        .from("order_items")
        .delete()
        .eq("id", orderItemId)
        .eq("order_id", orderId);
      if (deleteError) throw deleteError;
    } else if (body.action === "set_discount" || body.action === "set_service_charge") {
      const value = Number(body.action === "set_discount" ? body.discount_amount : body.service_charge_amount);
      if (!Number.isFinite(value) || value < 0) {
        return new Response(JSON.stringify({ error: "Valor precisa ser um número >= 0" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recalcula subtotal a partir dos itens que sobraram — nunca acumula
    // incrementalmente, sempre soma do zero (mesma disciplina do
    // place-dine-in-order). Desconto/taxa de serviço só mudam quando a ação é
    // set_discount/set_service_charge; nas outras ações, mantém o valor atual
    // do pedido.
    const { data: items, error: itemsError } = await serviceClient
      .from("order_items")
      .select("quantity, unit_price, order_item_addons(quantity, unit_price)")
      .eq("order_id", orderId);
    if (itemsError) throw itemsError;

    const subtotal = (items ?? []).reduce((sum, item) => {
      const addonsPerUnit = (item.order_item_addons ?? []).reduce(
        (s: number, a: { quantity: number; unit_price: number }) => s + Number(a.unit_price) * a.quantity,
        0,
      );
      return sum + (Number(item.unit_price) + addonsPerUnit) * item.quantity;
    }, 0);

    const discountAmount =
      body.action === "set_discount" ? Math.min(Number(body.discount_amount), subtotal) : Number(order.discount_amount);
    const serviceChargeAmount =
      body.action === "set_service_charge" ? Number(body.service_charge_amount) : Number(order.service_charge_amount);
    const total = Math.max(0, subtotal - discountAmount + serviceChargeAmount);

    const { error: updateError } = await serviceClient
      .from("orders")
      .update({ subtotal, discount_amount: discountAmount, service_charge_amount: serviceChargeAmount, total })
      .eq("id", orderId);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, subtotal, discount_amount: discountAmount, service_charge_amount: serviceChargeAmount, total }), {
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
