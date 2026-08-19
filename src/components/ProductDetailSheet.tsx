import { useState } from "react";
import { Clock, Minus, Plus, X } from "lucide-react";
import type { Addon, AddonGroup } from "../lib/addons";
import type { CartAddon, CartComboChoice, CartHalfFlavor } from "../lib/CartContext";
import { computeHalfAndHalfPrice, type HalfAndHalfPricingMode } from "../lib/halfAndHalfPricing";
import type { Product } from "../lib/menu";
import type { RemovableIngredient } from "../lib/removableIngredients";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function HalfAndHalfIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0" aria-hidden>
      <path d="M12 2a10 10 0 0 0 0 20z" className="fill-primary" />
      <path d="M12 2a10 10 0 0 1 0 20z" className="fill-accent" />
    </svg>
  );
}

// Tela de detalhe do produto, aberta ao tocar num card no cardápio (não só
// no botão "+") — foto grande, descrição por inteiro e um seletor de
// quantidade, além de qualquer customização (adicionais, meio a meio, combo,
// ingredientes removíveis) quando o produto tiver. Substituiu o antigo
// AddonPickerSheet, que só aparecia pra produtos com customização e não
// mostrava foto/descrição nenhuma.
export function ProductDetailSheet({
  product,
  groups,
  halfAndHalf,
  initialHalfFlavorId,
  comboChoiceGroups,
  removableIngredients,
  onClose,
  onConfirm,
}: {
  product: Product;
  groups: { group: AddonGroup; addons: Addon[] }[];
  halfAndHalf?: { pricingMode: HalfAndHalfPricingMode; options: Product[] };
  // Vem do popup "inteira ou meio a meio?" (HalfAndHalfChoiceDialog), que já
  // roda ANTES dessa ficha abrir quando a categoria permite — chega aqui só
  // pra pré-marcar o sabor escolhido lá. A seção "Meio a meio" continua
  // visível e editável aqui, caso a pessoa queira trocar de sabor sem
  // reabrir o popup inteiro.
  initialHalfFlavorId?: string | null;
  comboChoiceGroups?: { id: string; name: string; options: Product[] }[];
  removableIngredients?: RemovableIngredient[];
  onClose: () => void;
  onConfirm: (payload: {
    addons: CartAddon[];
    halfFlavor?: CartHalfFlavor;
    comboChoices?: CartComboChoice[];
    removedIngredients?: RemovableIngredient[];
    quantity: number;
  }) => void;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [halfFlavorId, setHalfFlavorId] = useState<string | null>(initialHalfFlavorId ?? null);
  const [choiceSelections, setChoiceSelections] = useState<Record<string, string>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  function updateQuantity(addonId: string, delta: number) {
    setSelected((prev) => {
      const next = Math.max(0, (prev[addonId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[addonId];
      else copy[addonId] = next;
      return copy;
    });
  }

  const allAddons = groups.flatMap((g) => g.addons);
  const extraTotal = allAddons.reduce((sum, addon) => sum + (selected[addon.id] ?? 0) * addon.price, 0);

  const selectedHalfProduct = halfAndHalf?.options.find((p) => p.id === halfFlavorId) ?? null;
  const basePrice = selectedHalfProduct
    ? computeHalfAndHalfPrice(product.price, selectedHalfProduct.price, halfAndHalf!.pricingMode)
    : product.price;

  const missingChoiceGroups = (comboChoiceGroups ?? []).filter((group) => !choiceSelections[group.id]);
  const missingRequiredAddonGroups = groups.filter(
    ({ group, addons }) => group.required && !addons.some((addon) => (selected[addon.id] ?? 0) > 0),
  );
  const canConfirm = missingChoiceGroups.length === 0 && missingRequiredAddonGroups.length === 0 && !product.sold_out;

  function toggleRemovedIngredient(ingredientId: string) {
    setRemovedIds((prev) =>
      prev.includes(ingredientId) ? prev.filter((id) => id !== ingredientId) : [...prev, ingredientId],
    );
  }

  function handleConfirm() {
    if (!canConfirm) return;
    const chosen: CartAddon[] = allAddons
      .filter((addon) => (selected[addon.id] ?? 0) > 0)
      .map((addon) => ({ addonId: addon.id, name: addon.name, price: addon.price, quantity: selected[addon.id] }));
    const comboChoices: CartComboChoice[] = (comboChoiceGroups ?? []).flatMap((group) => {
      const chosenProductId = choiceSelections[group.id];
      const option = group.options.find((p) => p.id === chosenProductId);
      if (!option) return [];
      return [{ groupId: group.id, groupName: group.name, productId: option.id, name: option.name }];
    });
    const removed = (removableIngredients ?? []).filter((ingredient) => removedIds.includes(ingredient.ingredientId));
    onConfirm({
      addons: chosen,
      halfFlavor: selectedHalfProduct ? { productId: selectedHalfProduct.id, name: selectedHalfProduct.name, price: basePrice } : undefined,
      comboChoices: comboChoices.length > 0 ? comboChoices : undefined,
      removedIngredients: removed.length > 0 ? removed : undefined,
      quantity,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-background shadow-elevated">
        <div className="flex-1 overflow-y-auto">
          <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted sm:h-56">
            {product.image_url ? (
              // object-contain: foto inteira, sem cortar — mesmo ajuste do
              // card da lista.
              <img src={product.image_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="h-full w-full" style={{ backgroundImage: "var(--gradient-primary)" }} />
            )}
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="press absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-foreground shadow-card"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="px-5 py-4">
            <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
            {product.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            )}
            {product.prep_minutes != null && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden /> {product.prep_minutes} min
              </span>
            )}
            {product.sold_out && (
              <p className="mt-2 text-sm font-bold text-destructive">Esgotado no momento.</p>
            )}
          </div>

          <div className="px-5">
            {halfAndHalf && halfAndHalf.options.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 flex items-center gap-2">
                  <HalfAndHalfIcon />
                  <div>
                    <h3 className="text-sm font-bold">Meio a meio</h3>
                    <p className="text-xs text-muted-foreground">Metade {product.name}, metade outro sabor</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {halfAndHalf.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setHalfFlavorId((prev) => (prev === option.id ? null : option.id))}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-medium ${
                        halfFlavorId === option.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className="line-clamp-1">{option.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{currency(option.price)}</span>
                    </button>
                  ))}
                </div>
                {selectedHalfProduct && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Metade {product.name} + metade {selectedHalfProduct.name} — {currency(basePrice)}
                  </p>
                )}
              </div>
            )}

            {(comboChoiceGroups ?? []).map((group) => (
              <div key={group.id} className="mb-5">
                <h3 className="mb-2 text-sm font-bold">{group.name}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {group.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setChoiceSelections((prev) => ({ ...prev, [group.id]: option.id }))}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-medium ${
                        choiceSelections[group.id] === option.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className="line-clamp-1">{option.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {groups.map(({ group, addons }) => (
              <div key={group.id} className="mb-5">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                  {group.required && <span className="ml-1 normal-case text-destructive">· obrigatório</span>}
                </h3>
                <ul className="space-y-3">
                  {addons.map((addon) => (
                    <li key={addon.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{addon.name}</p>
                        <p className="text-xs text-muted-foreground">+ {currency(addon.price)}</p>
                      </div>
                      <div className="press flex items-center gap-2 rounded-full bg-primary/10 px-1 py-1">
                        <button
                          type="button"
                          aria-label={`Diminuir ${addon.name}`}
                          onClick={() => updateQuantity(addon.id, -1)}
                          className="grid h-7 w-7 place-items-center rounded-full bg-white text-primary shadow-xs"
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <span className="min-w-[1ch] text-center text-sm font-bold">{selected[addon.id] ?? 0}</span>
                        <button
                          type="button"
                          aria-label={`Aumentar ${addon.name}`}
                          onClick={() => updateQuantity(addon.id, 1)}
                          className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {removableIngredients && removableIngredients.length > 0 && (
              <div className="mb-5">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Remover ingredientes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {removableIngredients.map((ingredient) => {
                    const isRemoved = removedIds.includes(ingredient.ingredientId);
                    return (
                      <button
                        key={ingredient.ingredientId}
                        type="button"
                        onClick={() => toggleRemovedIngredient(ingredient.ingredientId)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          isRemoved
                            ? "border-destructive bg-destructive/10 text-destructive line-through"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {ingredient.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Quantidade</span>
            <div className="press flex items-center gap-3 rounded-full bg-primary/10 px-1 py-1">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-primary shadow-xs"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="min-w-[1.5ch] text-center text-base font-bold">{quantity}</span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={() => setQuantity((q) => q + 1)}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="text-base font-bold">{currency((basePrice + extraTotal) * quantity)}</span>
          </div>
          {missingChoiceGroups.length > 0 && (
            <p className="mb-2 text-xs text-destructive">
              Selecione uma opção em "{missingChoiceGroups[0].name}" pra continuar.
            </p>
          )}
          {missingChoiceGroups.length === 0 && missingRequiredAddonGroups.length > 0 && (
            <p className="mb-2 text-xs text-destructive">
              Selecione ao menos 1 em "{missingRequiredAddonGroups[0].group.name}" pra continuar.
            </p>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="press w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {product.sold_out ? "Esgotado" : "Adicionar ao carrinho"}
          </button>
        </div>
      </div>
    </div>
  );
}
