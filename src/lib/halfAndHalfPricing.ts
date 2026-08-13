export type HalfAndHalfPricingMode = "higher_price" | "average";

export function computeHalfAndHalfPrice(priceA: number, priceB: number, mode: HalfAndHalfPricingMode): number {
  if (mode === "average") return Math.round(((priceA + priceB) / 2) * 100) / 100;
  return Math.max(priceA, priceB);
}
