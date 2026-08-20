/**
 * Monta o documento de impressão como um array declarativo de comandos
 * ("DSL"), nunca como bytes ESC/POS.
 *
 * Isso mora no navegador (app restaurante), não no agente, de propósito:
 * corrigir a formatação de uma comanda vira um deploy do front, sem
 * atualizar o ImpressoraPDVSigma.exe instalado em cada restaurante. Quem
 * traduz o DSL pra bytes é o agente Go (`agente/internal/escpos/renderer.go`),
 * que é o único lugar que precisa saber de code page e sequência de corte.
 *
 * Movido de supabase/functions/_shared/escpos-doc.ts quando o PrintBridge
 * (fila de impressão no banco) foi substituído pelo agente local — ver
 * CLAUDE.md, seção "Ticket printing".
 */

import { itemTotal, type IncomingOrder, type IncomingOrderItem } from "./orders";

export type EscPosCommand =
  | { op: "text"; value: string; bold?: boolean; align?: "left" | "center" | "right"; size?: "normal" | "double" }
  | { op: "columns"; left: string; right: string }
  | { op: "line" }
  | { op: "feed"; lines: number }
  | { op: "cut" };

export type DocumentType = "comanda_cozinha" | "comanda_entrega" | "conta_mesa" | "teste";

// Colunas por largura de papel, em fonte A. É o que decide onde o texto
// quebra — 58 mm e 80 mm se comportam bem diferente. Precisa bater com
// escpos.ColumnsFor no agente Go.
export function columnsFor(paperWidth: number): number {
  return paperWidth === 58 ? 32 : 48;
}

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Mesma regra do app: mesa, código de retirada ou entrega. */
function locationLabel(order: IncomingOrder): string {
  if (order.order_type === "pickup") return `RETIRADA #${order.pickup_code ?? "?"}`;
  if (order.order_type === "delivery") return "ENTREGA";
  return `MESA ${order.table_label ?? "?"}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Comanda da cozinha: sem preço nenhum. Quem está fritando não precisa saber
 * quanto custou, precisa saber o que montar — e preço no meio da lista só
 * atrapalha a leitura rápida.
 */
export function buildComandaCozinha(order: IncomingOrder, restaurantName: string): EscPosCommand[] {
  const cmds: EscPosCommand[] = [
    { op: "text", value: restaurantName, align: "center", bold: true },
    { op: "text", value: locationLabel(order), align: "center", bold: true, size: "double" },
    { op: "line" },
    { op: "text", value: `Pedido ${order.id.slice(0, 8).toUpperCase()}` },
    { op: "text", value: timeLabel(order.created_at) },
  ];

  if (order.customer_name) cmds.push({ op: "text", value: `Cliente: ${order.customer_name}` });
  if (order.customer_phone) cmds.push({ op: "text", value: `Tel: ${order.customer_phone}` });
  cmds.push({ op: "line" });

  for (const item of order.items) {
    cmds.push({ op: "text", value: `${item.quantity}x ${item.product_name}`, bold: true });
    if (item.half_flavor_name) {
      cmds.push({ op: "text", value: `   1/2 ${item.half_flavor_name}` });
    }
    for (const choice of item.combo_choices) {
      cmds.push({ op: "text", value: `   ${choice.group_name}: ${choice.option_name}` });
    }
    for (const addon of item.addons) {
      cmds.push({ op: "text", value: `   + ${addon.quantity}x ${addon.name}` });
    }
    // Remoção vai em CAIXA ALTA: é o erro mais caro da cozinha, precisa
    // saltar aos olhos mesmo numa impressão fraca.
    for (const removed of item.removed_ingredients) {
      cmds.push({ op: "text", value: `   *** SEM ${removed.toUpperCase()} ***`, bold: true });
    }
    if (item.notes) cmds.push({ op: "text", value: `   Obs: ${item.notes}` });
  }

  if (order.notes) {
    cmds.push({ op: "line" });
    cmds.push({ op: "text", value: `OBS: ${order.notes}`, bold: true });
  }

  cmds.push({ op: "feed", lines: 3 }, { op: "cut" });
  return cmds;
}

/**
 * Comanda de entrega: o entregador precisa de endereço e de quanto cobrar.
 */
export function buildComandaEntrega(order: IncomingOrder, restaurantName: string): EscPosCommand[] {
  const cmds: EscPosCommand[] = [
    { op: "text", value: restaurantName, align: "center", bold: true },
    { op: "text", value: "ENTREGA", align: "center", bold: true, size: "double" },
    { op: "line" },
    { op: "text", value: `Pedido ${order.id.slice(0, 8).toUpperCase()}` },
    { op: "text", value: timeLabel(order.created_at) },
  ];

  if (order.customer_name) cmds.push({ op: "text", value: `Cliente: ${order.customer_name}`, bold: true });
  if (order.customer_phone) cmds.push({ op: "text", value: `Tel: ${order.customer_phone}` });
  if (order.delivery_address) {
    cmds.push({ op: "line" });
    cmds.push({ op: "text", value: "ENDERECO", bold: true });
    cmds.push({ op: "text", value: order.delivery_address.text });
    if (order.neighborhood_name) cmds.push({ op: "text", value: order.neighborhood_name, bold: true });
  }
  if (order.delivery_driver_name) {
    cmds.push({ op: "text", value: `Motoboy: ${order.delivery_driver_name}` });
  }
  if (order.payment_method === "cash") {
    cmds.push({
      op: "text",
      value: order.change_for != null ? `DINHEIRO - TROCO PARA ${currency(order.change_for)}` : "DINHEIRO",
      bold: true,
    });
  }

  cmds.push({ op: "line" });
  for (const item of order.items) {
    cmds.push({ op: "columns", left: `${item.quantity}x ${item.product_name}`, right: currency(itemTotal(item)) });
    if (item.half_flavor_name) cmds.push({ op: "text", value: `   1/2 ${item.half_flavor_name}` });
    for (const choice of item.combo_choices) {
      cmds.push({ op: "text", value: `   ${choice.group_name}: ${choice.option_name}` });
    }
    for (const addon of item.addons) {
      cmds.push({ op: "text", value: `   + ${addon.quantity}x ${addon.name}` });
    }
    for (const removed of item.removed_ingredients) {
      cmds.push({ op: "text", value: `   *** SEM ${removed.toUpperCase()} ***`, bold: true });
    }
    if (item.notes) cmds.push({ op: "text", value: `   Obs: ${item.notes}` });
  }

  cmds.push({ op: "line" }, ...totalsBlock(order));
  if (order.notes) cmds.push({ op: "text", value: `OBS: ${order.notes}` });
  cmds.push({ op: "feed", lines: 3 }, { op: "cut" });
  return cmds;
}

/** Conta da mesa: o que o cliente confere antes de pagar. */
export function buildContaMesa(order: IncomingOrder, restaurantName: string): EscPosCommand[] {
  const cmds: EscPosCommand[] = [
    { op: "text", value: restaurantName, align: "center", bold: true },
    { op: "text", value: locationLabel(order), align: "center", bold: true },
    { op: "text", value: timeLabel(order.created_at), align: "center" },
    { op: "line" },
  ];

  for (const item of order.items) {
    cmds.push({ op: "columns", left: `${item.quantity}x ${item.product_name}`, right: currency(itemTotal(item)) });
    if (item.half_flavor_name) cmds.push({ op: "text", value: `   1/2 ${item.half_flavor_name}` });
    for (const addon of item.addons) {
      cmds.push({ op: "text", value: `   + ${addon.quantity}x ${addon.name}` });
    }
  }

  cmds.push({ op: "line" }, ...totalsBlock(order));
  cmds.push(
    { op: "feed", lines: 1 },
    { op: "text", value: "Nao e documento fiscal", align: "center" },
    { op: "feed", lines: 3 },
    { op: "cut" },
  );
  return cmds;
}

/**
 * Bloco de totais. Desconto e taxa de serviço só aparecem quando existem —
 * linha "Desconto R$ 0,00" numa conta é ruído.
 */
function totalsBlock(order: IncomingOrder): EscPosCommand[] {
  const cmds: EscPosCommand[] = [{ op: "columns", left: "Subtotal", right: currency(order.subtotal) }];
  if (order.discount_amount > 0) {
    cmds.push({ op: "columns", left: "Desconto", right: `-${currency(order.discount_amount)}` });
  }
  if (order.service_charge_amount > 0) {
    cmds.push({ op: "columns", left: "Servico", right: currency(order.service_charge_amount) });
  }
  if (order.delivery_fee_amount > 0) {
    cmds.push({ op: "columns", left: "Taxa de entrega", right: currency(order.delivery_fee_amount) });
  }
  cmds.push({ op: "line" });
  cmds.push({ op: "text", value: `TOTAL ${currency(order.total)}`, bold: true, size: "double", align: "right" });
  return cmds;
}

/** Página de teste — valida impressora, largura e acentuação de uma vez. */
export function buildTeste(restaurantName: string, printerName: string, paperWidth: number): EscPosCommand[] {
  return [
    { op: "text", value: "SIGMA IMPRESSAO", align: "center", bold: true, size: "double" },
    { op: "text", value: "Pagina de teste", align: "center" },
    { op: "line" },
    { op: "text", value: `Restaurante: ${restaurantName}` },
    { op: "text", value: `Impressora: ${printerName}` },
    { op: "text", value: `Papel: ${paperWidth} mm (${columnsFor(paperWidth)} colunas)` },
    { op: "text", value: timeLabel(new Date().toISOString()) },
    { op: "line" },
    // Se sair lixo nesta linha, a code page CP860 não foi aplicada.
    { op: "text", value: "Acentuacao: ção pão açaí Coração" },
    { op: "columns", left: "Coluna esquerda", right: "direita" },
    { op: "text", value: "Negrito", bold: true },
    { op: "text", value: "Centralizado", align: "center" },
    { op: "feed", lines: 3 },
    { op: "cut" },
  ];
}

/** Escolhe o tipo de comanda pelo canal do pedido — mesmo mapeamento que o
 * antigo `enqueue_print_job()` do PrintBridge fazia no banco. */
export function documentTypeFor(order: Pick<IncomingOrder, "order_type">): DocumentType {
  return order.order_type === "delivery" ? "comanda_entrega" : "comanda_cozinha";
}

/** Monta os comandos certos pro pedido, pelo canal (cozinha vs. entrega). */
export function buildOrderDocument(order: IncomingOrder, restaurantName: string): EscPosCommand[] {
  return documentTypeFor(order) === "comanda_entrega"
    ? buildComandaEntrega(order, restaurantName)
    : buildComandaCozinha(order, restaurantName);
}

// Reexportado só pra deixar claro, no ponto de uso, que o total de item é o
// mesmo cálculo do resto do app — sem duplicar a lógica aqui.
export type { IncomingOrder, IncomingOrderItem };
