import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";
import { requireRestaurantStaff } from "../_shared/customer-guard.ts";

type AddonInput = { addon_id?: string; quantity?: number };
type HalfAndHalfPricingMode = "higher_price" | "average";

type RequestBody = {
  order_id?: string;
  action?: "add_item" | "remove_item" | "set_notes" | "set_discount" | "set_service_charge";
  product_id?: string;
  quantity?: number;
  notes?: string;
  order_item_id?: string;
  discount_amount?: number;
  service_charge_amount?: number;
  addons?: AddonInput[];
  removed_ingredient_ids?: string[];
  half_flavor_product_id?: string;
};

// Mesma fórmula do client (src/lib/halfAndHalfPricing.ts) e do
// place-dine-in-order — replicada aqui porque essa função roda em Deno,
// runtime separado do bundle do frontend.
function computeHalfAndHalfPrice(priceA: number, priceB: number, mode: HalfAndHalfPricingMode): number {
  if (mode === "average") return Math.round(((priceA + priceB) / 2) * 100) / 100;
  return Math.max(priceA, priceB);
}

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
      .select("id, restaurant_id, subtotal, discount_amount, service_charge_amount, delivery_fee_amount")
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

    // Ações abaixo mudam subtotal/total — se o pedido já tem divisão de conta
    // configurada, isso quebraria "soma das partes = total". Bloqueia se
    // alguma parte já foi paga; se não, a divisão antiga não faz mais sentido
    // com o total novo, então apaga (o garçom reconfigura depois de editar).
    if (["add_item", "remove_item", "set_discount", "set_service_charge"].includes(body.action ?? "")) {
      const { data: splits, error: splitsError } = await serviceClient
        .from("order_payment_splits")
        .select("id, status")
        .eq("order_id", orderId);
      if (splitsError) throw splitsError;
      if ((splits ?? []).some((s) => s.status === "paid")) {
        return new Response(
          JSON.stringify({ error: "Pedido tem partes da conta já pagas — desfaça a divisão antes de editar itens/desconto" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if ((splits ?? []).length > 0) {
        const { error: deleteError } = await serviceClient.from("order_payment_splits").delete().eq("order_id", orderId);
        if (deleteError) throw deleteError;
      }
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
      // place-dine-in-order. Adicionais, meio a meio e remover ingrediente
      // são suportados (mesma validação de cada); combo (escolha dentro do
      // combo) continua fora — mesma simplificação já assumida no
      // ManualOrderModal.
      const { data: product, error: productError } = await serviceClient
        .from("products")
        .select("id, price, category_id, categories(allow_half_and_half, half_and_half_pricing)")
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

      // Meio a meio: segundo sabor precisa existir, ser da MESMA categoria do
      // produto principal, e a categoria precisa permitir meio a meio. Preço
      // é sempre recalculado (maior valor ou média), nunca confia no client.
      let unitPrice = Number(product.price);
      let halfFlavorProductId: string | null = null;
      let halfFlavorName: string | null = null;
      const requestedHalfFlavorId = String(body.half_flavor_product_id ?? "");
      if (requestedHalfFlavorId) {
        const categorySettings = product.categories as unknown as {
          allow_half_and_half: boolean;
          half_and_half_pricing: HalfAndHalfPricingMode;
        } | null;
        const { data: halfProduct, error: halfProductError } = await serviceClient
          .from("products")
          .select("id, name, price, category_id")
          .eq("id", requestedHalfFlavorId)
          .eq("restaurant_id", restaurantId)
          .eq("active", true)
          .eq("sold_out", false)
          .maybeSingle();
        if (halfProductError) throw halfProductError;
        if (!halfProduct || !categorySettings?.allow_half_and_half || halfProduct.category_id !== product.category_id) {
          return new Response(
            JSON.stringify({ error: "Uma combinação de meio a meio não é válida pra esse item" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        unitPrice = computeHalfAndHalfPrice(Number(product.price), Number(halfProduct.price), categorySettings.half_and_half_pricing);
        halfFlavorProductId = halfProduct.id;
        halfFlavorName = halfProduct.name;
      }

      const addonInputs = Array.isArray(body.addons) ? body.addons : [];
      const addonIds = [...new Set(addonInputs.map((a) => String(a.addon_id ?? "")).filter(Boolean))];
      const addonById = new Map<string, { id: string; name: string; price: number; category_id: string; group_id: string }>();
      if (addonIds.length > 0) {
        const { data: addonRows, error: addonsError } = await serviceClient
          .from("addons")
          .select("id, name, price, group_id, addon_groups(category_id, restaurant_id)")
          .eq("active", true)
          .in("id", addonIds);
        if (addonsError) throw addonsError;
        for (const addon of addonRows ?? []) {
          const group = addon.addon_groups as unknown as { category_id: string; restaurant_id: string } | null;
          if (!group) continue;
          addonById.set(addon.id, {
            id: addon.id,
            name: addon.name,
            price: Number(addon.price),
            category_id: group.category_id,
            group_id: addon.group_id,
          });
        }
      }

      const invalidAddonIds: string[] = [];
      const resolvedAddons = addonInputs.flatMap((a) => {
        const addonId = String(a.addon_id ?? "");
        const addonQuantity = Number(a.quantity ?? 0);
        const addon = addonById.get(addonId);
        if (!addon || addon.category_id !== product.category_id || !Number.isInteger(addonQuantity) || addonQuantity < 1) {
          invalidAddonIds.push(addonId);
          return [];
        }
        return [{ addon_id: addon.id, name: addon.name, unit_price: addon.price, quantity: addonQuantity, group_id: addon.group_id }];
      });
      if (invalidAddonIds.length > 0) {
        return new Response(
          JSON.stringify({ error: "Um ou mais adicionais não são válidos pra esse item", invalid_addon_ids: invalidAddonIds }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (product.category_id) {
        const { data: requiredGroups, error: requiredGroupsError } = await serviceClient
          .from("addon_groups")
          .select("id, name")
          .eq("category_id", product.category_id)
          .eq("required", true);
        if (requiredGroupsError) throw requiredGroupsError;
        const missing = (requiredGroups ?? []).filter((g) => !resolvedAddons.some((a) => a.group_id === g.id));
        if (missing.length > 0) {
          return new Response(
            JSON.stringify({ error: `Falta escolher um adicional obrigatório: ${missing.map((g) => g.name).join(", ")}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Retirada de ingrediente: precisa pertencer mesmo à ficha técnica
      // (product_ingredients) do produto, e estar marcado como removível —
      // mesma checagem do place-dine-in-order. Não afeta preço.
      const removedIngredientIds = [...new Set((Array.isArray(body.removed_ingredient_ids) ? body.removed_ingredient_ids : []).map(String))];
      const resolvedRemovedIngredients: { ingredient_id: string; name: string }[] = [];
      if (removedIngredientIds.length > 0) {
        const { data: productIngredientRows, error: productIngredientsError } = await serviceClient
          .from("product_ingredients")
          .select("ingredient_id, ingredients(name)")
          .eq("product_id", product.id)
          .eq("removable", true)
          .in("ingredient_id", removedIngredientIds);
        if (productIngredientsError) throw productIngredientsError;
        const nameByIngredientId = new Map(
          (productIngredientRows ?? []).flatMap((row) => {
            const ingredient = row.ingredients as unknown as { name: string } | null;
            return ingredient ? [[row.ingredient_id, ingredient.name] as const] : [];
          }),
        );
        const invalidRemovedIds = removedIngredientIds.filter((id) => !nameByIngredientId.has(id));
        if (invalidRemovedIds.length > 0) {
          return new Response(
            JSON.stringify({ error: "Um ou mais ingredientes a remover não pertencem a esse produto", invalid_removed_ingredients: invalidRemovedIds }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        for (const id of removedIngredientIds) resolvedRemovedIngredients.push({ ingredient_id: id, name: nameByIngredientId.get(id)! });
      }

      const itemNotes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
      const { data: insertedItem, error: insertError } = await serviceClient
        .from("order_items")
        .insert({
          order_id: orderId,
          product_id: product.id,
          quantity,
          unit_price: unitPrice,
          half_flavor_product_id: halfFlavorProductId,
          half_flavor_name: halfFlavorName,
          notes: itemNotes,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      if (resolvedAddons.length > 0) {
        const { error: addonsInsertError } = await serviceClient.from("order_item_addons").insert(
          resolvedAddons.map((a) => ({
            order_item_id: insertedItem.id,
            addon_id: a.addon_id,
            name: a.name,
            quantity: a.quantity,
            unit_price: a.unit_price,
          })),
        );
        if (addonsInsertError) throw addonsInsertError;
      }

      if (resolvedRemovedIngredients.length > 0) {
        const { error: removedInsertError } = await serviceClient.from("order_item_removed_ingredients").insert(
          resolvedRemovedIngredients.map((r) => ({
            order_item_id: insertedItem.id,
            ingredient_id: r.ingredient_id,
            ingredient_name: r.name,
          })),
        );
        if (removedInsertError) throw removedInsertError;
      }
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
    // delivery_fee_amount é fixado na criação do pedido (congelado junto do
    // bairro escolhido) — nunca muda por aqui, só carrega pro recálculo.
    const deliveryFeeAmount = Number(order.delivery_fee_amount);
    const total = Math.max(0, subtotal - discountAmount + serviceChargeAmount + deliveryFeeAmount);

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
