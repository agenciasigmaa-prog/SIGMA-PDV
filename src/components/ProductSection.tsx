import type { Product } from "../lib/menu";
import type { ComboComponent } from "../lib/comboItems";
import type { ComboChoiceGroup } from "../lib/comboChoiceGroups";
import { ProductCard } from "./ProductCard";

export function ProductSection({
  id,
  title,
  products,
  quantities,
  hasAddons,
  hasHalfAndHalf,
  comboItemsByProduct,
  comboChoiceGroupsByProduct,
  onAdd,
  onRemove,
}: {
  id: string;
  title: string;
  products: Product[];
  quantities: Record<string, number>;
  hasAddons: boolean;
  hasHalfAndHalf?: boolean;
  comboItemsByProduct?: Map<string, ComboComponent[]>;
  comboChoiceGroupsByProduct?: Map<string, ComboChoiceGroup[]>;
  onAdd: (product: Product) => void;
  onRemove: (product: Product) => void;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-bold md:text-xl">{title}</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            quantity={quantities[product.id] ?? 0}
            hasAddons={hasAddons}
            hasHalfAndHalf={hasHalfAndHalf}
            comboItems={comboItemsByProduct?.get(product.id)}
            hasComboChoice={(comboChoiceGroupsByProduct?.get(product.id)?.length ?? 0) > 0}
            onAdd={() => onAdd(product)}
            onRemove={() => onRemove(product)}
          />
        ))}
      </div>
    </section>
  );
}
