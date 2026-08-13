import type { Product } from "./menu";

export type CategoryFilter = "all" | "uncategorized" | string;

export function filterProducts(
  products: Product[],
  { search, categoryFilter }: { search: string; categoryFilter: CategoryFilter },
): Product[] {
  const q = search.trim().toLowerCase();
  return products.filter((product) => {
    if (categoryFilter === "uncategorized" && product.category_id !== null) return false;
    if (categoryFilter !== "all" && categoryFilter !== "uncategorized" && product.category_id !== categoryFilter) {
      return false;
    }
    if (q && !product.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
