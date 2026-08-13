import { supabase } from "./supabase";
import type { CartItem } from "./CartContext";
import { computeHalfAndHalfPrice, type HalfAndHalfPricingMode } from "./halfAndHalfPricing";

export type PriceChange = { lineId: string; name: string; oldPrice: number; newPrice: number };

export type CartPriceCheckResult = {
  changes: PriceChange[];
  removed: { lineId: string; name: string }[];
};

// Comparação em centavos (inteiro), não em decimal — evita qualquer ruído de
// ponto flutuante acusar mudança de preço onde não houve nenhuma.
function toCents(value: number): number {
  return Math.round(value * 100);
}

// Chamado uma única vez, só no clique de "Confirmar pedido" — nunca em
// background, nunca em loop. Se nada mudou, devolve os dois arrays vazios.
export async function checkCartPrices(items: CartItem[]): Promise<CartPriceCheckResult> {
  if (items.length === 0) return { changes: [], removed: [] };

  const ids = [...new Set(items.flatMap((item) => [item.productId, ...(item.halfFlavor ? [item.halfFlavor.productId] : [])]))];
  const { data } = await supabase
    .from("products")
    .select("id, name, price, active, categories(half_and_half_pricing)")
    .in("id", ids);
  const byId = new Map(
    (data ?? []).map((p) => [
      p.id,
      { ...p, categories: p.categories as unknown as { half_and_half_pricing: HalfAndHalfPricingMode } | null },
    ]),
  );

  const changes: PriceChange[] = [];
  const removed: { lineId: string; name: string }[] = [];

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || !product.active) {
      removed.push({ lineId: item.lineId, name: item.name });
      continue;
    }

    if (item.halfFlavor) {
      const second = byId.get(item.halfFlavor.productId);
      if (!second || !second.active) {
        removed.push({ lineId: item.lineId, name: item.name });
        continue;
      }
      const mode = product.categories?.half_and_half_pricing ?? "higher_price";
      const expectedPrice = computeHalfAndHalfPrice(Number(product.price), Number(second.price), mode);
      if (toCents(item.price) !== toCents(expectedPrice)) {
        changes.push({
          lineId: item.lineId,
          name: `${product.name} / ${second.name}`,
          oldPrice: item.price,
          newPrice: expectedPrice,
        });
      }
      continue;
    }

    if (toCents(item.price) !== toCents(Number(product.price))) {
      changes.push({
        lineId: item.lineId,
        name: product.name,
        oldPrice: item.price,
        newPrice: Number(product.price),
      });
    }
  }

  return { changes, removed };
}
