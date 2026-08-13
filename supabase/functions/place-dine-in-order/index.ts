import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";
import { requireCustomer } from "../_shared/customer-guard.ts";

type AddonInput = { addon_id: string; quantity: number };
type ComboChoiceInput = { group_id: string; option_product_id: string };
type ItemInput = {
  product_id: string;
  quantity: number;
  addons?: AddonInput[];
  half_flavor_product_id?: string;
  combo_choices?: ComboChoiceInput[];
};
type HalfAndHalfPricingMode = "higher_price" | "average";

// Mesma fórmula do client (src/lib/halfAndHalfPricing.ts) — replicada aqui
// porque essa função roda em Deno, runtime separado do bundle do frontend.
function computeHalfAndHalfPrice(priceA: number, priceB: number, mode: HalfAndHalfPricingMode): number {
  if (mode === "average") return Math.round(((priceA + priceB) / 2) * 100) / 100;
  return Math.max(priceA, priceB);
}

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

    // Preço NUNCA vem do client. Produto esgotado hoje cai no mesmo caminho de
    // "não disponível" que produto inativo/inexistente — não precisa de
    // checagem separada, o filtro abaixo já exclui os dois casos.
    const productIds = [
      ...new Set(
        items.flatMap((item) => [item.product_id, ...(item.half_flavor_product_id ? [item.half_flavor_product_id] : [])]),
      ),
    ];
    const { data: products, error: productsError } = await serviceClient
      .from("products")
      .select("id, name, price, category_id, categories(allow_half_and_half, half_and_half_pricing)")
      .eq("restaurant_id", table.restaurant_id)
      .eq("active", true)
      .eq("sold_out", false)
      .in("id", productIds);
    if (productsError) throw productsError;

    const productById = new Map((products ?? []).map((p) => [p.id, p]));
    const invalidIds = productIds.filter((id) => !productById.has(id));
    if (invalidIds.length > 0) {
      return new Response(
        JSON.stringify({ error: "Um ou mais itens não estão disponíveis neste restaurante", invalid_product_ids: invalidIds }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Adicionais também nunca confiam no preço/seleção do client — recalcula a
    // partir de addons.price, e só aceita adicional cujo grupo pertence à MESMA
    // categoria do produto pedido e ao mesmo restaurante da mesa.
    const addonIds = [...new Set(items.flatMap((item) => (item.addons ?? []).map((a) => a.addon_id)))];
    const addonById = new Map<
      string,
      { id: string; name: string; price: number; category_id: string; restaurant_id: string; group_id: string }
    >();
    if (addonIds.length > 0) {
      const { data: addons, error: addonsError } = await serviceClient
        .from("addons")
        .select("id, name, price, active, group_id, addon_groups(category_id, restaurant_id)")
        .eq("active", true)
        .in("id", addonIds);
      if (addonsError) throw addonsError;
      for (const addon of addons ?? []) {
        const group = addon.addon_groups as unknown as { category_id: string; restaurant_id: string } | null;
        if (!group) continue;
        addonById.set(addon.id, {
          id: addon.id,
          name: addon.name,
          price: Number(addon.price),
          category_id: group.category_id,
          restaurant_id: group.restaurant_id,
          group_id: addon.group_id,
        });
      }
    }

    // Grupos de adicional obrigatórios das categorias envolvidas — busca TODOS
    // de uma vez, mesmo os que o client não mandou nenhum addon (é exatamente
    // esse caso que precisa ser flagrado).
    const categoryIds = [...new Set((products ?? []).flatMap((p) => (p.category_id ? [p.category_id] : [])))];
    const { data: requiredGroups, error: requiredGroupsError } = categoryIds.length
      ? await serviceClient.from("addon_groups").select("id, category_id").eq("required", true).in("category_id", categoryIds)
      : { data: [] as { id: string; category_id: string }[], error: null };
    if (requiredGroupsError) throw requiredGroupsError;
    const requiredGroupsByCategory = new Map<string, string[]>();
    for (const g of requiredGroups ?? []) {
      const list = requiredGroupsByCategory.get(g.category_id) ?? [];
      list.push(g.id);
      requiredGroupsByCategory.set(g.category_id, list);
    }

    // Grupos de escolha dos combos pedidos ("escolha o hambúrguer") — busca
    // pra TODOS os produtos pedidos (não só os que vieram com combo_choices
    // no corpo), senão um client que simplesmente omite combo_choices
    // passaria sem escolher nada de um grupo obrigatório.
    const comboProductIds = [...new Set(items.map((item) => item.product_id))];
    const { data: choiceGroups, error: choiceGroupsError } = comboProductIds.length
      ? await serviceClient
          .from("combo_choice_groups")
          .select("id, name, product_id, combo_choice_options(option_product_id, products(name))")
          .in("product_id", comboProductIds)
      : { data: [] as never[], error: null };
    if (choiceGroupsError) throw choiceGroupsError;

    type ChoiceGroupResolved = { id: string; name: string; options: { productId: string; name: string }[] };
    const choiceGroupsByProduct = new Map<string, ChoiceGroupResolved[]>();
    for (const g of (choiceGroups ?? []) as unknown as {
      id: string;
      name: string;
      product_id: string;
      combo_choice_options: { option_product_id: string; products: { name: string } | null }[];
    }[]) {
      const options = g.combo_choice_options.flatMap((o) =>
        o.products ? [{ productId: o.option_product_id, name: o.products.name }] : [],
      );
      const list = choiceGroupsByProduct.get(g.product_id) ?? [];
      list.push({ id: g.id, name: g.name, options });
      choiceGroupsByProduct.set(g.product_id, list);
    }

    type ResolvedAddon = { addon_id: string; name: string; unit_price: number; quantity: number; group_id: string };
    type ResolvedComboChoice = { group_name: string; option_product_id: string; option_name: string };
    type ResolvedItem = {
      product_id: string;
      quantity: number;
      unit_price: number;
      addons: ResolvedAddon[];
      half_flavor_product_id: string | null;
      half_flavor_name: string | null;
      combo_choices: ResolvedComboChoice[];
    };

    const invalidAddonIds: string[] = [];
    const invalidHalfFlavorIds: string[] = [];
    const missingRequiredAddonGroupIds: string[] = [];
    const invalidComboChoiceGroupIds: string[] = [];

    const resolvedItems: ResolvedItem[] = items.map((item) => {
      const product = productById.get(item.product_id)!;

      const resolvedAddons: ResolvedAddon[] = (item.addons ?? []).flatMap((a) => {
        const addon = addonById.get(a.addon_id);
        if (!addon || addon.category_id !== product.category_id || addon.restaurant_id !== table.restaurant_id) {
          invalidAddonIds.push(a.addon_id);
          return [];
        }
        return [{ addon_id: addon.id, name: addon.name, unit_price: addon.price, quantity: a.quantity, group_id: addon.group_id }];
      });

      const requiredGroupIds = product.category_id ? (requiredGroupsByCategory.get(product.category_id) ?? []) : [];
      for (const groupId of requiredGroupIds) {
        const hasSelection = resolvedAddons.some((a) => a.group_id === groupId);
        if (!hasSelection) missingRequiredAddonGroupIds.push(groupId);
      }

      // Meio a meio: o segundo sabor precisa existir, ser da MESMA categoria do
      // produto principal, e a categoria precisa permitir meio a meio. Preço é
      // sempre recalculado (maior valor ou média), nunca confia no client.
      let unitPrice = Number(product.price);
      let halfFlavorProductId: string | null = null;
      let halfFlavorName: string | null = null;
      if (item.half_flavor_product_id) {
        const halfProduct = productById.get(item.half_flavor_product_id);
        const categorySettings = product.categories as unknown as {
          allow_half_and_half: boolean;
          half_and_half_pricing: HalfAndHalfPricingMode;
        } | null;
        if (!halfProduct || !categorySettings?.allow_half_and_half || halfProduct.category_id !== product.category_id) {
          invalidHalfFlavorIds.push(item.half_flavor_product_id);
        } else {
          unitPrice = computeHalfAndHalfPrice(Number(product.price), Number(halfProduct.price), categorySettings.half_and_half_pricing);
          halfFlavorProductId = halfProduct.id;
          halfFlavorName = halfProduct.name;
        }
      }

      // Combo com escolha: todo grupo do combo precisa ter exatamente uma
      // escolha válida enviada. Escolher uma opção não muda o preço do combo.
      const comboGroups = choiceGroupsByProduct.get(item.product_id) ?? [];
      const resolvedComboChoices: ResolvedComboChoice[] = [];
      for (const group of comboGroups) {
        const submitted = (item.combo_choices ?? []).find((c) => c.group_id === group.id);
        const option = submitted ? group.options.find((o) => o.productId === submitted.option_product_id) : undefined;
        if (!option) {
          invalidComboChoiceGroupIds.push(group.id);
          continue;
        }
        resolvedComboChoices.push({ group_name: group.name, option_product_id: option.productId, option_name: option.name });
      }

      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        addons: resolvedAddons,
        half_flavor_product_id: halfFlavorProductId,
        half_flavor_name: halfFlavorName,
        combo_choices: resolvedComboChoices,
      };
    });

    if (invalidAddonIds.length > 0) {
      return new Response(
        JSON.stringify({ error: "Um ou mais adicionais não são válidos pra esse item", invalid_addon_ids: invalidAddonIds }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (invalidHalfFlavorIds.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Uma combinação de meio a meio não é válida pra esse item",
          invalid_half_flavor_ids: invalidHalfFlavorIds,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (missingRequiredAddonGroupIds.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Falta escolher um adicional obrigatório",
          missing_required_addon_groups: [...new Set(missingRequiredAddonGroupIds)],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (invalidComboChoiceGroupIds.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Falta escolher uma opção válida em um grupo do combo",
          invalid_combo_choices: invalidComboChoiceGroupIds,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // addons[].quantity é "quantidade do adicional por UNIDADE do produto" —
    // por isso o custo dos adicionais também multiplica pela quantidade do
    // item (2 burgers com 1 bacon cada = 2 bacons cobrados, não 1).
    const total = resolvedItems.reduce((sum, item) => {
      const addonsPerUnit = item.addons.reduce((s, a) => s + a.unit_price * a.quantity, 0);
      return sum + (item.unit_price + addonsPerUnit) * item.quantity;
    }, 0);

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

    // Insere item por item (não em lote) pra conseguir o id de cada order_item
    // na hora e já linkar adicionais/escolhas de combo dele corretamente.
    for (const item of resolvedItems) {
      const { data: orderItem, error: itemError } = await serviceClient
        .from("order_items")
        .insert({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          half_flavor_product_id: item.half_flavor_product_id,
          half_flavor_name: item.half_flavor_name,
        })
        .select("id")
        .single();
      if (itemError) throw itemError;

      if (item.addons.length > 0) {
        const { error: addonsInsertError } = await serviceClient.from("order_item_addons").insert(
          item.addons.map((a) => ({
            order_item_id: orderItem.id,
            addon_id: a.addon_id,
            name: a.name,
            quantity: a.quantity,
            unit_price: a.unit_price,
          })),
        );
        if (addonsInsertError) throw addonsInsertError;
      }

      if (item.combo_choices.length > 0) {
        const { error: comboChoicesInsertError } = await serviceClient.from("order_item_combo_choices").insert(
          item.combo_choices.map((c) => ({
            order_item_id: orderItem.id,
            group_name: c.group_name,
            option_product_id: c.option_product_id,
            option_name: c.option_name,
          })),
        );
        if (comboChoicesInsertError) throw comboChoicesInsertError;
      }
    }

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
