import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import type { Addon, AddonGroup } from "../lib/addons";
import { computeHalfAndHalfPrice, type HalfAndHalfPricingMode } from "../lib/halfAndHalfPricing";
import type { RemovableIngredient } from "../lib/removableIngredients";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type HalfAndHalfOption = { id: string; name: string; price: number };

export type ItemCustomization = {
  addons: { addon_id: string; name: string; price: number; quantity: number }[];
  removedIngredientIds: string[];
  notes: string;
  halfFlavorProductId: string | null;
};

// Personalização ao lançar/adicionar item manualmente (staff) — adicionais,
// meio a meio, remover ingrediente e observação livre, sempre disponíveis
// num único passo, mesmo pra produto sem nenhuma dessas opções cadastrada
// (aí só a observação aparece). Antes só existia o caminho de adicionar o
// produto puro. Combo (escolha dentro do combo) continua fora.
export function ItemCustomizeModal({
  productName,
  productPrice,
  groups,
  removableIngredients,
  halfAndHalf,
  onClose,
  onConfirm,
}: {
  productName: string;
  productPrice: number;
  groups: { group: AddonGroup; addons: Addon[] }[];
  removableIngredients: RemovableIngredient[];
  // undefined/lista vazia = categoria não permite meio a meio, ou não há
  // outro produto na categoria pra combinar — a seção nem aparece.
  halfAndHalf?: { pricingMode: HalfAndHalfPricingMode; options: HalfAndHalfOption[] };
  onClose: () => void;
  onConfirm: (customization: ItemCustomization) => void;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [halfAndHalfChecked, setHalfAndHalfChecked] = useState(false);
  const [halfFlavorId, setHalfFlavorId] = useState<string | null>(null);

  function updateQuantity(addonId: string, delta: number) {
    setSelected((prev) => {
      const next = Math.max(0, (prev[addonId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[addonId];
      else copy[addonId] = next;
      return copy;
    });
  }

  function toggleRemoved(ingredientId: string) {
    setRemovedIds((prev) => (prev.includes(ingredientId) ? prev.filter((id) => id !== ingredientId) : [...prev, ingredientId]));
  }

  function toggleHalfAndHalf() {
    setHalfAndHalfChecked((prev) => !prev);
    setHalfFlavorId(null);
  }

  const hasHalfAndHalf = (halfAndHalf?.options.length ?? 0) > 0;
  const selectedHalfOption = halfAndHalf?.options.find((o) => o.id === halfFlavorId) ?? null;
  const basePrice =
    halfAndHalfChecked && selectedHalfOption ? computeHalfAndHalfPrice(productPrice, selectedHalfOption.price, halfAndHalf!.pricingMode) : productPrice;

  const allAddons = groups.flatMap((g) => g.addons);
  const extraTotal = allAddons.reduce((sum, addon) => sum + (selected[addon.id] ?? 0) * addon.price, 0);
  const missingRequired = groups.filter(
    ({ group, addons }) => group.required && !addons.some((a) => (selected[a.id] ?? 0) > 0),
  );
  const missingHalfFlavor = halfAndHalfChecked && !selectedHalfOption;
  const canConfirm = missingRequired.length === 0 && !missingHalfFlavor;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({
      addons: allAddons
        .filter((a) => (selected[a.id] ?? 0) > 0)
        .map((a) => ({ addon_id: a.id, name: a.name, price: a.price, quantity: selected[a.id] })),
      removedIngredientIds: removedIds,
      notes: notes.trim(),
      halfFlavorProductId: halfAndHalfChecked ? halfFlavorId : null,
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-bold">{productName}</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {hasHalfAndHalf && (
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={halfAndHalfChecked} onChange={toggleHalfAndHalf} className="h-4 w-4 rounded border-border" />
                Meio a meio?
              </label>
              {halfAndHalfChecked && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {halfAndHalf!.options.map((option) => (
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
              )}
            </div>
          )}

          {groups.map(({ group, addons }) => (
            <div key={group.id} className="mb-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {group.name}
                {group.required && <span className="ml-1 normal-case text-destructive">· obrigatório</span>}
              </h4>
              <ul className="space-y-2">
                {addons.map((addon) => (
                  <li key={addon.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{addon.name}</p>
                      <p className="text-xs text-muted-foreground">+ {currency(addon.price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-muted px-1 py-1">
                      <button
                        type="button"
                        aria-label={`Diminuir ${addon.name}`}
                        onClick={() => updateQuantity(addon.id, -1)}
                        className="grid h-6 w-6 place-items-center rounded-full bg-card text-foreground"
                      >
                        <Minus className="h-3 w-3" aria-hidden />
                      </button>
                      <span className="min-w-[1ch] text-center text-xs font-bold">{selected[addon.id] ?? 0}</span>
                      <button
                        type="button"
                        aria-label={`Aumentar ${addon.name}`}
                        onClick={() => updateQuantity(addon.id, 1)}
                        className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Plus className="h-3 w-3" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {removableIngredients.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Remover ingredientes</h4>
              <div className="flex flex-wrap gap-2">
                {removableIngredients.map((ingredient) => {
                  const isRemoved = removedIds.includes(ingredient.ingredientId);
                  return (
                    <button
                      key={ingredient.ingredientId}
                      type="button"
                      onClick={() => toggleRemoved(ingredient.ingredientId)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        isRemoved ? "border-destructive bg-destructive/10 text-destructive line-through" : "border-border hover:bg-muted"
                      }`}
                    >
                      {ingredient.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Observação (opcional)</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: ponto da carne, sem gelo..."
              rows={2}
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Item + adicionais</span>
            <span className="font-bold">{currency(basePrice + extraTotal)}</span>
          </div>
          {missingHalfFlavor && <p className="mb-2 text-xs text-destructive">Escolha o outro sabor pra continuar.</p>}
          {missingRequired.length > 0 && (
            <p className="mb-2 text-xs text-destructive">
              Selecione ao menos 1 em "{missingRequired[0].group.name}" pra continuar.
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105 disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
