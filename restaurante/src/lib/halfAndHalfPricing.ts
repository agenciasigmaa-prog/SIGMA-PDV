export type HalfAndHalfPricingMode = "higher_price" | "average";

// Mesma fórmula do storefront (src/lib/halfAndHalfPricing.ts na raiz) e do
// place-dine-in-order — preço final nunca confia no client, mas o cálculo
// local aqui serve só pra mostrar o total certo enquanto o garçom/caixa
// monta o pedido.
export function computeHalfAndHalfPrice(priceA: number, priceB: number, mode: HalfAndHalfPricingMode): number {
  if (mode === "average") return Math.round(((priceA + priceB) / 2) * 100) / 100;
  return Math.max(priceA, priceB);
}
