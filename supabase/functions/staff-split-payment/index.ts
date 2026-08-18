import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";
import { requireRestaurantStaff } from "../_shared/customer-guard.ts";

type SplitInput = { label?: string; amount?: number };
type ShareInput = { label?: string; weight?: number };
type AssignmentInput = { order_item_id?: string; shares?: ShareInput[] };
type PaymentInput = { method?: string; amount?: number };

type RequestBody = {
  order_id?: string;
  action?: "configure_split" | "mark_paid" | "void_split";
  mode?: "equal" | "manual" | "by_item";
  parts?: number;
  splits?: SplitInput[];
  assignments?: AssignmentInput[];
  split_id?: string;
  payments?: PaymentInput[];
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;

// Aloca `totalCents` entre `weights` proporcionalmente, sempre somando
// exatamente `totalCents` de volta (floor + maior resto/Hamilton — não "sobra
// pra primeira posição", que criaria viés sistemático na mesma pessoa em
// todo pedido dividido por item).
function distributeCents(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return distributeCents(totalCents, weights.map(() => 1));

  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floors = raw.map((r) => Math.floor(r));
  const allocated = floors.reduce((sum, f) => sum + f, 0);
  const remainder = totalCents - allocated;

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[byFraction[k].i] += 1;
  return result;
}

type OrderItemRow = {
  id: string;
  quantity: number;
  unit_price: number;
  order_item_addons: { quantity: number; unit_price: number }[];
};

function itemTotalCents(item: OrderItemRow): number {
  const addonsPerUnit = (item.order_item_addons ?? []).reduce(
    (sum, a) => sum + Number(a.unit_price) * a.quantity,
    0,
  );
  return toCents((Number(item.unit_price) + addonsPerUnit) * item.quantity);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { serviceClient, restaurantId } = await requireRestaurantStaff(req);
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const orderId = String(body.order_id ?? "");
    if (!orderId) return jsonError("order_id is required", 400);

    // Pedido precisa pertencer ao MESMO restaurante do staff logado — nunca
    // confia em restaurant_id vindo do client, só no que veio do profile.
    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .select("id, restaurant_id, subtotal, discount_amount, service_charge_amount, total, payment_status, status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.restaurant_id !== restaurantId) return jsonError("Pedido não encontrado", 404);

    if (body.action === "configure_split") {
      if (order.payment_status === "paid") {
        return jsonError("Pedido já foi marcado como pago — não é possível dividir a conta", 409);
      }

      const { data: existingSplits, error: existingError } = await serviceClient
        .from("order_payment_splits")
        .select("id, status")
        .eq("order_id", orderId);
      if (existingError) throw existingError;
      if ((existingSplits ?? []).some((s) => s.status === "paid")) {
        return jsonError("Existem partes já pagas — desfaça o pagamento antes de reconfigurar a divisão", 409);
      }

      const totalCents = toCents(Number(order.total));
      let newSplits: { label: string; amountCents: number }[];

      if (body.mode === "equal") {
        const parts = Number(body.parts);
        if (!Number.isInteger(parts) || parts < 1) {
          return jsonError("parts precisa ser um inteiro >= 1", 400);
        }
        const base = Math.floor(totalCents / parts);
        const remainder = totalCents - base * parts;
        newSplits = Array.from({ length: parts }, (_, i) => ({
          label: `Parte ${i + 1}`,
          amountCents: base + (i < remainder ? 1 : 0),
        }));
      } else if (body.mode === "manual") {
        const inputs = Array.isArray(body.splits) ? body.splits : [];
        if (inputs.length === 0) return jsonError("Informe ao menos uma parte", 400);
        newSplits = [];
        for (const input of inputs) {
          const label = typeof input.label === "string" ? input.label.trim() : "";
          const amount = Number(input.amount);
          if (!label) return jsonError("Toda parte precisa de um rótulo", 400);
          if (!Number.isFinite(amount) || amount < 0) return jsonError(`Valor inválido para "${label}"`, 400);
          newSplits.push({ label, amountCents: toCents(amount) });
        }
        const sumCents = newSplits.reduce((sum, s) => sum + s.amountCents, 0);
        if (sumCents !== totalCents) {
          const diff = fromCents(totalCents - sumCents);
          return jsonError(
            `A soma das partes (${fromCents(sumCents).toFixed(2)}) não bate com o total do pedido (${fromCents(totalCents).toFixed(2)}) — diferença de ${diff.toFixed(2)}`,
            400,
          );
        }
      } else if (body.mode === "by_item") {
        const assignments = Array.isArray(body.assignments) ? body.assignments : [];

        const { data: items, error: itemsError } = await serviceClient
          .from("order_items")
          .select("id, quantity, unit_price, order_item_addons(quantity, unit_price)")
          .eq("order_id", orderId);
        if (itemsError) throw itemsError;

        const assignmentByItem = new Map(assignments.map((a) => [String(a.order_item_id ?? ""), a]));
        const missing = (items ?? []).filter((item) => !assignmentByItem.has(item.id));
        if (missing.length > 0) {
          return jsonError(
            `Itens sem pessoa atribuída: ${missing.map((m) => m.id).join(", ")}`,
            400,
          );
        }

        const personSubtotalCents = new Map<string, number>();
        const labelOrder: string[] = [];

        for (const item of (items ?? []) as OrderItemRow[]) {
          const assignment = assignmentByItem.get(item.id)!;
          const shares = Array.isArray(assignment.shares) ? assignment.shares : [];
          if (shares.length === 0) return jsonError(`Item sem pessoa atribuída: ${item.id}`, 400);

          const seenLabels = new Set<string>();
          for (const share of shares) {
            const label = typeof share.label === "string" ? share.label.trim() : "";
            const weight = Number(share.weight ?? 1);
            if (!label) return jsonError(`Pessoa sem rótulo no item ${item.id}`, 400);
            if (!Number.isFinite(weight) || weight <= 0) return jsonError(`Peso inválido para "${label}" no item ${item.id}`, 400);
            if (seenLabels.has(label)) return jsonError(`"${label}" repetida no mesmo item (${item.id})`, 400);
            seenLabels.add(label);
          }

          const weights = shares.map((s) => Number(s.weight ?? 1));
          const allocation = distributeCents(itemTotalCents(item), weights);
          shares.forEach((share, i) => {
            const label = String(share.label).trim();
            if (!personSubtotalCents.has(label)) {
              personSubtotalCents.set(label, 0);
              labelOrder.push(label);
            }
            personSubtotalCents.set(label, personSubtotalCents.get(label)! + allocation[i]);
          });
        }

        const weights = labelOrder.map((label) => personSubtotalCents.get(label)!);
        const discountAlloc = distributeCents(toCents(Number(order.discount_amount)), weights);
        const serviceAlloc = distributeCents(toCents(Number(order.service_charge_amount)), weights);

        newSplits = labelOrder.map((label, i) => ({
          label,
          amountCents: personSubtotalCents.get(label)! - discountAlloc[i] + serviceAlloc[i],
        }));
      } else {
        return jsonError("mode inválido — use equal, manual ou by_item", 400);
      }

      // Rede de segurança: a soma sempre deve bater com o total do pedido por
      // construção (distributeCents conserva a soma em cada etapa); se não
      // bater é bug interno, não erro do usuário.
      const sumCheck = newSplits.reduce((sum, s) => sum + s.amountCents, 0);
      if (sumCheck !== totalCents) throw new Error("Falha ao calcular divisão: soma não bate com o total");

      if ((existingSplits ?? []).length > 0) {
        const { error: deleteError } = await serviceClient.from("order_payment_splits").delete().eq("order_id", orderId);
        if (deleteError) throw deleteError;
      }

      const { data: inserted, error: insertError } = await serviceClient
        .from("order_payment_splits")
        .insert(
          newSplits.map((s, i) => ({
            order_id: orderId,
            restaurant_id: restaurantId,
            label: s.label,
            amount: fromCents(s.amountCents),
            sort_order: i,
          })),
        )
        .select("id, label, amount, payment_method, status, paid_at, voided_at");
      if (insertError) throw insertError;

      return jsonOk({ splits: inserted });
    }

    if (body.action === "mark_paid") {
      const payments = Array.isArray(body.payments) ? body.payments : [];
      if (payments.length === 0) return jsonError("Informe ao menos uma forma de pagamento", 400);
      for (const p of payments) {
        if (!["cash", "card", "pix"].includes(String(p.method))) return jsonError("payment_method inválido", 400);
        if (!Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) return jsonError("Valor de pagamento inválido", 400);
      }

      let splitId = body.split_id ? String(body.split_id) : "";
      let splitAmount: number;

      if (splitId) {
        const { data: split, error: splitError } = await serviceClient
          .from("order_payment_splits")
          .select("id, amount, status")
          .eq("id", splitId)
          .eq("order_id", orderId)
          .maybeSingle();
        if (splitError) throw splitError;
        if (!split) return jsonError("Parte não encontrada", 404);
        if (split.status === "paid") return jsonError("Parte já está paga", 409);
        splitAmount = Number(split.amount);
      } else {
        const { data: existingSplits, error: existingError } = await serviceClient
          .from("order_payment_splits")
          .select("id")
          .eq("order_id", orderId);
        if (existingError) throw existingError;
        if ((existingSplits ?? []).length > 0) {
          return jsonError("Pedido tem divisão configurada — selecione uma parte", 400);
        }
        // Cria implicitamente um único split cobrindo o total do pedido, pra
        // "Confirmar pagamento" funcionar sem o garçom precisar dividir a
        // conta primeiro. Risco aceito: duas requisições concorrentes SEM
        // nenhum split ainda (duplo clique no primeiro pagamento de um
        // pedido) podem em teoria criar dois splits implícitos — mesma
        // categoria de risco já aceita no contador de pickup_code do
        // place-dine-in-order, e não o bug de double-charge que o CAS abaixo
        // já fecha (que é o caso comum: duplo clique num split existente).
        const { data: created, error: createError } = await serviceClient
          .from("order_payment_splits")
          .insert({ order_id: orderId, restaurant_id: restaurantId, label: "Pagamento total", amount: order.total, sort_order: 0 })
          .select("id, amount")
          .single();
        if (createError) throw createError;
        splitId = created.id;
        splitAmount = Number(created.amount);
      }

      const paymentsCents = payments.map((p) => toCents(Number(p.amount)));
      const sumCents = paymentsCents.reduce((sum, c) => sum + c, 0);
      const targetCents = toCents(splitAmount);
      if (sumCents !== targetCents) {
        const diff = fromCents(targetCents - sumCents);
        return jsonError(
          `A soma dos pagamentos (${fromCents(sumCents).toFixed(2)}) não bate com o valor da parte (${fromCents(targetCents).toFixed(2)}) — diferença de ${diff.toFixed(2)}`,
          400,
        );
      }

      const singleMethod = payments.length === 1 ? String(payments[0].method) : null;

      // Compare-and-swap: só marca pago se ainda estiver pending — sem isso,
      // duplo clique/retry de rede insere pagamento duplicado mesmo com o
      // status final correto (dinheiro fantasma no ledger).
      const { data: updatedRows, error: updateError } = await serviceClient
        .from("order_payment_splits")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: singleMethod, voided_at: null })
        .eq("id", splitId)
        .eq("status", "pending")
        .select("id");
      if (updateError) throw updateError;
      if ((updatedRows ?? []).length === 0) return jsonError("Parte já está paga", 409);

      const { error: paymentsInsertError } = await serviceClient.from("order_payment_split_payments").insert(
        payments.map((p) => ({
          split_id: splitId,
          restaurant_id: restaurantId,
          method: String(p.method),
          amount: Number(p.amount),
        })),
      );
      if (paymentsInsertError) throw paymentsInsertError;

      const { data: allSplits, error: allSplitsError } = await serviceClient
        .from("order_payment_splits")
        .select("status")
        .eq("order_id", orderId);
      if (allSplitsError) throw allSplitsError;

      if ((allSplits ?? []).every((s) => s.status === "paid")) {
        const { error: payError } = await serviceClient.from("orders").update({ payment_status: "paid" }).eq("id", orderId);
        if (payError) throw payError;
      }

      return jsonOk({ split_id: splitId });
    }

    if (body.action === "void_split") {
      const splitId = String(body.split_id ?? "");
      if (!splitId) return jsonError("split_id is required", 400);
      if (order.status === "cancelled") return jsonError("Pedido está cancelado", 409);

      const { data: split, error: splitError } = await serviceClient
        .from("order_payment_splits")
        .select("id, status")
        .eq("id", splitId)
        .eq("order_id", orderId)
        .maybeSingle();
      if (splitError) throw splitError;
      if (!split) return jsonError("Parte não encontrada", 404);
      if (split.status !== "paid") return jsonError("Parte não está paga", 400);

      const { error: updateError } = await serviceClient
        .from("order_payment_splits")
        .update({ status: "pending", voided_at: new Date().toISOString(), payment_method: null, paid_at: null })
        .eq("id", splitId);
      if (updateError) throw updateError;

      // Limpa os pagamentos registrados — senão, ao pagar de novo, fica lixo
      // de pagamento antigo junto do novo.
      const { error: paymentsDeleteError } = await serviceClient
        .from("order_payment_split_payments")
        .delete()
        .eq("split_id", splitId);
      if (paymentsDeleteError) throw paymentsDeleteError;

      // Não depende do trigger de banco pra reverter: ele só intercepta
      // tentativas de SETAR 'paid', não desfaz um 'paid' já gravado.
      const { error: revertError } = await serviceClient
        .from("orders")
        .update({ payment_status: "pending" })
        .eq("id", orderId)
        .eq("payment_status", "paid");
      if (revertError) throw revertError;

      return jsonOk({});
    }

    return jsonError("Ação inválida", 400);
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: serializeError(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
