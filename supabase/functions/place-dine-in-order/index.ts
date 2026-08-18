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
  removed_ingredient_ids?: string[];
  notes?: string;
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

    // Pedido manual lançado pelo staff (telefone/balcão) não tem cliente de
    // verdade por trás — se quem chamou é staff/admin, customer_id fica null
    // em vez do id do funcionário (senão o histórico de "clientes" ficaria
    // contaminado com o próprio staff).
    const { data: callerProfile } = await serviceClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const callerIsStaff =
      callerProfile?.role === "restaurant_owner" || callerProfile?.role === "restaurant_staff" || callerProfile?.role === "admin";
    const customer_id = callerIsStaff ? null : user.id;

    const body = await req.json().catch(() => ({}));
    const restaurant_id = String(body.restaurant_id ?? "");
    const customer_name = String(body.customer_name ?? "").trim();
    const table_label = String(body.table_label ?? "").trim();
    const delivery_address_text = String(body.delivery_address ?? "").trim();
    const order_type = body.order_type === "pickup" ? "pickup" : body.order_type === "delivery" ? "delivery" : "dine_in";
    const items = (Array.isArray(body.items) ? body.items : []) as ItemInput[];
    // Forma de pagamento pretendida, escolhida na hora do pedido (não a
    // confirmação de pagamento em si, que é outra coisa e vive em
    // order_payment_splits) — hoje só usada pra avisar o motoboy "leva
    // troco" quando for dinheiro. Não valida contra nada além do enum.
    const payment_method =
      body.payment_method === "cash" || body.payment_method === "card" || body.payment_method === "pix"
        ? body.payment_method
        : null;
    // Troco só faz sentido em dinheiro — valor bruto lido aqui, validado
    // (>= total) mais abaixo depois que o total é calculado no servidor.
    const requestedChangeFor = payment_method === "cash" && body.change_for != null ? Number(body.change_for) : null;

    // waiter_id/delivery_driver_id só existem pra pedido lançado por staff
    // (ManualOrderModal) — um cliente anônimo do storefront nunca escolhe
    // garçom/motoboy. Mesmo se um request de cliente mandar o campo
    // manualmente, ignora (nunca confia que o client não vai mandar) —
    // mesmo crivo de callerIsStaff já usado acima pra customer_id.
    const requestedWaiterId = callerIsStaff && body.waiter_id ? String(body.waiter_id) : "";
    const requestedDeliveryDriverId = callerIsStaff && body.delivery_driver_id ? String(body.delivery_driver_id) : "";
    const requestedNeighborhoodId = String(body.neighborhood_id ?? "");

    // Não existe mais mesa mapeada por QR — o cliente/staff digita o próprio
    // nome e o número da mesa na hora de confirmar. Texto livre, só exige não
    // vazio; não valida contra nada (decisão explícita — errar é raro e sem
    // problema, a mesa é só endereço pro garçom entregar). Retirada no balcão
    // não tem mesa — em vez disso, gera um código de retirada mais abaixo.
    // Entrega não tem mesa nem código, mas precisa de endereço — mesmo texto
    // livre, sem validar formato (staff digita o que o cliente falou).
    if (
      !restaurant_id ||
      !customer_name ||
      items.length === 0 ||
      (order_type === "dine_in" && !table_label) ||
      (order_type === "delivery" && !delivery_address_text) ||
      (order_type === "delivery" && !requestedNeighborhoodId)
    ) {
      return new Response(
        JSON.stringify({
          error: "restaurant_id, customer_name, items, endereço/mesa (conforme o canal) e bairro (pra entrega) are required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from("restaurants")
      .select("id")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (restaurantError) throw restaurantError;
    if (!restaurant) {
      return new Response(JSON.stringify({ error: "Restaurante não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Garçom inválido/de outro restaurante não deve travar o pedido inteiro
    // (atribuir garçom não é crítico o bastante pra bloquear a criação) — só
    // ignora e grava null.
    let waiter_id: string | null = null;
    if (requestedWaiterId) {
      const { data: waiter } = await serviceClient
        .from("waiters")
        .select("id")
        .eq("id", requestedWaiterId)
        .eq("restaurant_id", restaurant_id)
        .maybeSingle();
      waiter_id = waiter?.id ?? null;
    }

    // Motoboy inválido/de outro restaurante também não trava o pedido — só
    // ignora e grava null, mesmo raciocínio do garçom acima.
    let delivery_driver_id: string | null = null;
    if (requestedDeliveryDriverId) {
      const { data: driver } = await serviceClient
        .from("delivery_drivers")
        .select("id")
        .eq("id", requestedDeliveryDriverId)
        .eq("restaurant_id", restaurant_id)
        .maybeSingle();
      delivery_driver_id = driver?.id ?? null;
    }

    // Bairro é obrigatório pra pedido de entrega (validado acima) — a taxa
    // cobrada do cliente é congelada aqui (neighborhood_name/delivery_fee)
    // pra nunca mudar de valor se o dono editar a taxa do bairro depois.
    // Esse valor é exatamente o que o motoboy recebe por essa entrega.
    let neighborhood_id: string | null = null;
    let neighborhood_name: string | null = null;
    let delivery_fee_amount = 0;
    if (order_type === "delivery") {
      const { data: neighborhood, error: neighborhoodError } = await serviceClient
        .from("neighborhoods")
        .select("id, name, delivery_fee")
        .eq("id", requestedNeighborhoodId)
        .eq("restaurant_id", restaurant_id)
        .eq("active", true)
        .maybeSingle();
      if (neighborhoodError) throw neighborhoodError;
      if (!neighborhood) {
        return new Response(JSON.stringify({ error: "Bairro não encontrado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      neighborhood_id = neighborhood.id;
      neighborhood_name = neighborhood.name;
      delivery_fee_amount = Number(neighborhood.delivery_fee);
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
      .eq("restaurant_id", restaurant_id)
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
    // pra TODOS os produtos pedidos (não só os que vieram com combo_choices no
    // corpo), senão um client que simplesmente omite combo_choices passaria
    // sem escolher nada de um grupo obrigatório.
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

    // Retirada de ingrediente: precisa pertencer mesmo à ficha técnica
    // (product_ingredients) do produto pedido, e o ingrediente precisa estar
    // marcado como removível (removable) — mesma ética de nunca confiar só
    // no que o client mandou, agora também pro ingrediente travado (ex. pão
    // de um hambúrguer) que a UI já nem oferece a opção de tirar. Não afeta
    // preço.
    const { data: productIngredientRows, error: productIngredientsError } = comboProductIds.length
      ? await serviceClient
          .from("product_ingredients")
          .select("product_id, ingredient_id, ingredients(name)")
          .in("product_id", comboProductIds)
          .eq("removable", true)
      : { data: [] as never[], error: null };
    if (productIngredientsError) throw productIngredientsError;

    const ingredientNameByProduct = new Map<string, Map<string, string>>();
    for (const row of (productIngredientRows ?? []) as unknown as {
      product_id: string;
      ingredient_id: string;
      ingredients: { name: string } | null;
    }[]) {
      if (!row.ingredients) continue;
      const map = ingredientNameByProduct.get(row.product_id) ?? new Map<string, string>();
      map.set(row.ingredient_id, row.ingredients.name);
      ingredientNameByProduct.set(row.product_id, map);
    }

    type ResolvedAddon = { addon_id: string; name: string; unit_price: number; quantity: number; group_id: string };
    type ResolvedComboChoice = { group_name: string; option_product_id: string; option_name: string };
    type ResolvedRemovedIngredient = { ingredient_id: string; name: string };
    type ResolvedItem = {
      product_id: string;
      quantity: number;
      unit_price: number;
      addons: ResolvedAddon[];
      half_flavor_product_id: string | null;
      half_flavor_name: string | null;
      combo_choices: ResolvedComboChoice[];
      removed_ingredients: ResolvedRemovedIngredient[];
      notes: string | null;
    };

    const invalidAddonIds: string[] = [];
    const invalidHalfFlavorIds: string[] = [];
    const missingRequiredAddonGroupIds: string[] = [];
    const invalidComboChoiceGroupIds: string[] = [];
    const invalidRemovedIngredientIds: string[] = [];

    const resolvedItems: ResolvedItem[] = items.map((item) => {
      const product = productById.get(item.product_id)!;

      const resolvedAddons: ResolvedAddon[] = (item.addons ?? []).flatMap((a) => {
        const addon = addonById.get(a.addon_id);
        if (!addon || addon.category_id !== product.category_id || addon.restaurant_id !== restaurant_id) {
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

      const resolvedRemovedIngredients: ResolvedRemovedIngredient[] = (item.removed_ingredient_ids ?? []).flatMap((ingredientId) => {
        const name = ingredientNameByProduct.get(item.product_id)?.get(ingredientId);
        if (!name) {
          invalidRemovedIngredientIds.push(ingredientId);
          return [];
        }
        return [{ ingredient_id: ingredientId, name }];
      });

      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        addons: resolvedAddons,
        half_flavor_product_id: halfFlavorProductId,
        half_flavor_name: halfFlavorName,
        combo_choices: resolvedComboChoices,
        removed_ingredients: resolvedRemovedIngredients,
        notes: typeof item.notes === "string" && item.notes.trim() ? item.notes.trim() : null,
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
    if (invalidRemovedIngredientIds.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Um ou mais ingredientes a remover não pertencem a esse produto",
          invalid_removed_ingredients: invalidRemovedIngredientIds,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // addons[].quantity é "quantidade do adicional por UNIDADE do produto" —
    // por isso o custo dos adicionais também multiplica pela quantidade do
    // item (2 burgers com 1 bacon cada = 2 bacons cobrados, não 1).
    const itemsSubtotal = resolvedItems.reduce((sum, item) => {
      const addonsPerUnit = item.addons.reduce((s, a) => s + a.unit_price * a.quantity, 0);
      return sum + (item.unit_price + addonsPerUnit) * item.quantity;
    }, 0);
    // Taxa de entrega soma no total cobrado do cliente — aparece separada do
    // subtotal dos itens na comanda/conta (mesmo padrão de desconto/taxa de
    // serviço), pra transparência de quanto é comida e quanto é entrega.
    const total = itemsSubtotal + delivery_fee_amount;

    // Troco só existe pra delivery em dinheiro, e nunca pode ser menor que o
    // total (senão não sobra troco nenhum pra dar) — validado aqui, depois
    // que o total já foi recalculado no servidor, nunca confia no client.
    if (order_type === "delivery" && requestedChangeFor != null && requestedChangeFor < total) {
      return new Response(
        JSON.stringify({ error: "O troco pedido precisa ser maior ou igual ao total do pedido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const change_for = order_type === "delivery" ? requestedChangeFor : null;

    // Código de retirada: 4 dígitos, sequencial por dia por restaurante —
    // conta quantos pedidos "pickup" esse restaurante já teve hoje e usa
    // count + 1. Corrida entre dois pedidos simultâneos poderia, em teoria,
    // gerar o mesmo número — aceitável nesse volume, seja lançado pelo staff
    // ou direto pelo cliente no cardápio público.
    let pickup_code: string | null = null;
    if (order_type === "pickup") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { count, error: countError } = await serviceClient
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant_id)
        .eq("order_type", "pickup")
        .gte("created_at", startOfToday.toISOString());
      if (countError) throw countError;
      pickup_code = String((count ?? 0) + 1).padStart(4, "0");
    }

    // Cada pedido confirmado é seu próprio ticket, cobrado individualmente —
    // não existe mais table_sessions/comanda agrupando vários pedidos da mesma
    // mesa. table_session_id fica sempre null.
    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .insert({
        restaurant_id,
        customer_id,
        waiter_id,
        delivery_driver_id,
        order_type,
        status: "received",
        customer_name,
        table_label: order_type === "dine_in" ? table_label : null,
        delivery_address: order_type === "delivery" ? { text: delivery_address_text } : null,
        neighborhood_id,
        neighborhood_name,
        delivery_fee_amount,
        pickup_code,
        payment_status: "pending",
        payment_method,
        change_for,
        subtotal: itemsSubtotal,
        total,
      })
      .select("id")
      .single();
    if (orderError) throw orderError;

    // Insere item por item (não em lote) pra conseguir o id de cada order_item
    // na hora e já linkar adicionais/escolhas/retiradas dele corretamente.
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
          notes: item.notes,
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

      if (item.removed_ingredients.length > 0) {
        const { error: removedInsertError } = await serviceClient.from("order_item_removed_ingredients").insert(
          item.removed_ingredients.map((r) => ({
            order_item_id: orderItem.id,
            ingredient_id: r.ingredient_id,
            ingredient_name: r.name,
          })),
        );
        if (removedInsertError) throw removedInsertError;
      }
    }

    await serviceClient.from("restaurants").update({ last_order_at: new Date().toISOString() }).eq("id", restaurant_id);

    return new Response(JSON.stringify({ order_id: order.id, total, pickup_code }), {
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
