import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { ComboItemsEditor } from "./ComboItemsEditor";
import { ComboChoiceGroupsEditor } from "./ComboChoiceGroupsEditor";
import { IngredientsEditor } from "./IngredientsEditor";
import { ProductImageCarouselEditor } from "./ProductImageCarouselEditor";
import type { Category, Product } from "../lib/menu";
import { loadProductIngredientLines, type Ingredient, type ProductIngredientLine } from "../lib/ingredients";
import { loadComboItems, type ComboItemLine } from "../lib/comboItems";
import { loadComboChoiceGroups, type ComboChoiceGroupLine } from "../lib/comboChoiceGroups";
import { loadProductImages } from "../lib/productImages";

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export function ProductPanel({
  restaurantId,
  categories,
  ingredientCatalog,
  productCatalog,
  product,
  defaultCategoryId,
  initialName,
  initialIngredientLines,
  onClose,
  onSave,
}: {
  restaurantId: string;
  categories: Category[];
  ingredientCatalog: Ingredient[];
  productCatalog: Product[];
  product?: Product;
  defaultCategoryId?: string | null;
  initialName?: string;
  initialIngredientLines?: ProductIngredientLine[];
  onClose: () => void;
  onSave: (input: {
    name: string;
    description: string | null;
    image_url: string | null;
    images: string[];
    price: number;
    original_price: number | null;
    prep_minutes: number | null;
    category_id: string | null;
    active: boolean;
    most_ordered: boolean;
    ingredientLines: ProductIngredientLine[];
    comboItems: ComboItemLine[];
    comboChoiceGroups: ComboChoiceGroupLine[];
  }) => Promise<void>;
}) {
  const [images, setImages] = useState<string[]>(product?.image_url ? [product.image_url] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(product?.price ?? null);
  const [hasDiscount, setHasDiscount] = useState(product?.original_price != null);
  const [originalPrice, setOriginalPrice] = useState<number | null>(product?.original_price ?? null);
  const [ingredientLines, setIngredientLines] = useState<ProductIngredientLine[]>(initialIngredientLines ?? []);
  const [comboItems, setComboItems] = useState<ComboItemLine[]>([]);
  const [comboChoiceGroups, setComboChoiceGroups] = useState<ComboChoiceGroupLine[]>([]);

  useEffect(() => {
    if (!product) return;
    loadProductIngredientLines(product.id).then(setIngredientLines);
    loadComboItems(product.id).then(setComboItems);
    loadComboChoiceGroups(product.id).then(setComboChoiceGroups);
    loadProductImages(product.id).then((urls) => {
      if (urls.length > 0) setImages(urls);
    });
  }, [product]);

  function toggleDiscount(checked: boolean) {
    setHasDiscount(checked);
    if (!checked) setOriginalPrice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const prepMinutesRaw = String(form.get("prep_minutes") ?? "");
    const categoryId = String(form.get("category_id") ?? "");

    if (!name || price == null) {
      setError("Nome e preço de venda são obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name,
        description: description || null,
        image_url: images[0] ?? null,
        images,
        price,
        original_price: hasDiscount ? originalPrice : null,
        prep_minutes: prepMinutesRaw ? Number(prepMinutesRaw) : null,
        category_id: categoryId || null,
        active: form.get("active") === "on",
        most_ordered: form.get("most_ordered") === "on",
        ingredientLines: ingredientLines.filter((line) => line.quantity_used > 0),
        comboItems: comboItems.filter((line) => line.quantity > 0),
        comboChoiceGroups: comboChoiceGroups.filter((group) => group.name.trim() && group.options.length > 0),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar produto.");
      setSaving(false);
    }
  }

  const initialCategoryId = product ? (product.category_id ?? "") : (defaultCategoryId ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{product ? "Editar produto" : "Novo produto"}</h2>
          <button type="button" onClick={onClose} className="press rounded-full p-2 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <ProductImageCarouselEditor restaurantId={restaurantId} images={images} onChange={setImages} />

            <FormSection title="Informações básicas">
              <Field label="Nome do produto">
                <input
                  name="name"
                  defaultValue={product?.name ?? initialName ?? ""}
                  required
                  placeholder="Ex: Duplo Cheddar"
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Descrição">
                <textarea
                  name="description"
                  defaultValue={product?.description ?? ""}
                  placeholder="Ex: Dois blends 120g, cheddar cremoso duplo"
                  rows={2}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Categoria">
                <select
                  name="category_id"
                  defaultValue={initialCategoryId}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <FormSection title="Preço e tempo de preparo">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Preço de venda">
                  <CurrencyInput
                    value={price}
                    onChange={setPrice}
                    required
                    placeholder="R$ 0,00"
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Tempo de preparo">
                  <div className="relative">
                    <input
                      name="prep_minutes"
                      type="number"
                      min="0"
                      defaultValue={product?.prep_minutes ?? ""}
                      placeholder="20"
                      className="w-full rounded-xl border border-border px-3 py-2 pr-10 text-sm"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      min
                    </span>
                  </div>
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasDiscount} onChange={(e) => toggleDiscount(e.target.checked)} />
                Este produto está em promoção
              </label>

              {hasDiscount && (
                <Field label="Preço original (antes do desconto)">
                  <CurrencyInput
                    value={originalPrice}
                    onChange={setOriginalPrice}
                    placeholder="R$ 0,00"
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aparece riscado no cardápio ao lado do preço de venda.
                  </p>
                </Field>
              )}
            </FormSection>

            <IngredientsEditor
              catalog={ingredientCatalog}
              lines={ingredientLines}
              onChange={setIngredientLines}
              price={price}
            />

            <ComboItemsEditor
              catalog={product ? productCatalog.filter((p) => p.id !== product.id) : productCatalog}
              lines={comboItems}
              onChange={setComboItems}
            />

            <ComboChoiceGroupsEditor
              catalog={product ? productCatalog.filter((p) => p.id !== product.id) : productCatalog}
              groups={comboChoiceGroups}
              onChange={setComboChoiceGroups}
            />

            <FormSection title="Visibilidade">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="mt-0.5" />
                <span>
                  Ativo
                  <span className="block text-xs text-muted-foreground">Aparece no cardápio pro cliente</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="most_ordered"
                  defaultChecked={product?.most_ordered ?? false}
                  className="mt-0.5"
                />
                <span>
                  Mais pedido
                  <span className="block text-xs text-muted-foreground">Mostra um selo de destaque no card</span>
                </span>
              </label>
            </FormSection>
          </div>

          <div className="border-t border-border px-5 py-4">
            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
