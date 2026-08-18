import { useEffect, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import type { Ingredient, ProductIngredientLine, Unit } from "../lib/ingredients";
import { lineCost, totalCmv } from "../lib/ingredients";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const UNIT_LABEL: Record<Unit, string> = { g: "g", ml: "ml", un: "un" };
const UNIT_QUESTION_LABEL: Record<Unit, string> = { g: "Peso (g)", ml: "Volume (ml)", un: "Unidade" };
const UNITS: Unit[] = ["g", "ml", "un"];

export function IngredientsEditor({
  catalog,
  lines,
  onChange,
  price,
  onLiveCmvChange,
}: {
  catalog: Ingredient[];
  lines: ProductIngredientLine[];
  onChange: (lines: ProductIngredientLine[]) => void;
  price: number | null;
  onLiveCmvChange?: (cmv: number) => void;
}) {
  const datalistId = useId();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [packagePrice, setPackagePrice] = useState<number | null>(null);
  const [packageQuantity, setPackageQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [error, setError] = useState<string | null>(null);

  const matched = catalog.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());

  function resetForm() {
    setName("");
    setQuantity("");
    setPackagePrice(null);
    setPackageQuantity("");
    setUnit("g");
    setError(null);
  }

  function handleAdd() {
    const trimmedName = name.trim();
    const quantityUsed = Number(quantity);
    if (!trimmedName || !quantityUsed || quantityUsed <= 0) {
      setError("Informe o nome e a quantidade usada.");
      return;
    }

    if (matched) {
      const existingIndex = lines.findIndex((line) => line.kind === "existing" && line.ingredient_id === matched.id);
      if (existingIndex >= 0) {
        const next = [...lines];
        const existing = next[existingIndex];
        next[existingIndex] = { ...existing, quantity_used: existing.quantity_used + quantityUsed };
        onChange(next);
      } else {
        onChange([
          ...lines,
          {
            kind: "existing",
            ingredient_id: matched.id,
            name: matched.name,
            unit: matched.unit,
            cost_per_unit: matched.cost_per_unit,
            quantity_used: quantityUsed,
            removable: true,
          },
        ]);
      }
      resetForm();
      return;
    }

    const packageQuantityNum = Number(packageQuantity);
    if (packagePrice == null || packagePrice < 0 || !packageQuantityNum || packageQuantityNum <= 0) {
      setError("Pra um ingrediente novo, informe quanto pagou e o tamanho da embalagem.");
      return;
    }

    onChange([
      ...lines,
      {
        kind: "new",
        name: trimmedName,
        unit,
        package_price: packagePrice,
        package_quantity: packageQuantityNum,
        quantity_used: quantityUsed,
        removable: true,
      },
    ]);
    resetForm();
  }

  function handleRemove(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function handleQuantityChange(index: number, rawValue: string) {
    const next = [...lines];
    next[index] = { ...next[index], quantity_used: rawValue === "" ? 0 : Number(rawValue) };
    onChange(next);
  }

  function handleToggleRemovable(index: number) {
    const next = [...lines];
    next[index] = { ...next[index], removable: !next[index].removable };
    onChange(next);
  }

  // Custo do que está sendo digitado agora, mesmo antes de clicar em
  // "Adicionar ingrediente" — é o que faz o total parecer instantâneo em vez
  // de só atualizar depois de confirmar cada linha.
  const quantityUsedNum = Number(quantity);
  const packageQuantityNum = Number(packageQuantity);
  const draftCost = (() => {
    if (!name.trim() || !quantityUsedNum || quantityUsedNum <= 0) return 0;
    if (matched) return matched.cost_per_unit * quantityUsedNum;
    if (packagePrice == null || packagePrice < 0 || !packageQuantityNum || packageQuantityNum <= 0) return 0;
    return (packagePrice / packageQuantityNum) * quantityUsedNum;
  })();

  const cmv = totalCmv(lines) + draftCost;
  const margin = price && price > 0 ? ((price - cmv) / price) * 100 : null;

  useEffect(() => {
    onLiveCmvChange?.(cmv);
  }, [cmv, onLiveCmvChange]);

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-sm font-semibold">Ingredientes (ficha técnica)</p>

      {lines.length > 0 && (
        <ul className="mb-3 space-y-2">
          {lines.map((line, index) => (
            <li
              key={`${line.kind === "existing" ? line.ingredient_id : line.name}-${index}`}
              className="rounded-lg border border-border p-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{line.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={line.quantity_used || ""}
                    onChange={(e) => handleQuantityChange(index, e.target.value)}
                    aria-label={`Quantidade de ${line.name}`}
                    className="w-16 rounded-lg border border-border px-1.5 py-1 text-right text-xs"
                  />
                  <span className="text-xs text-muted-foreground">{UNIT_LABEL[line.unit]}</span>
                </div>
                <span className="w-16 shrink-0 text-right text-xs font-semibold">{currency(lineCost(line))}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  aria-label={`Remover ${line.name}`}
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={line.removable}
                onClick={() => handleToggleRemovable(index)}
                className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${
                    line.removable ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                      line.removable ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </span>
                {line.removable ? "Cliente pode remover esse ingrediente" : "Cliente não pode remover esse ingrediente"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            list={datalistId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do ingrediente"
            className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm"
          />
          <datalist id={datalistId}>
            {catalog.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.name} />
            ))}
          </datalist>
          <input
            type="number"
            step="0.001"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={matched ? `Qtd. (${UNIT_LABEL[matched.unit]})` : "Qtd."}
            className="w-24 shrink-0 rounded-xl border border-border px-3 py-2 text-sm"
          />
        </div>

        {name.trim() && !matched && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs font-medium">Ingrediente novo — vendido por:</span>
              <div className="flex gap-1">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      unit === u
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {UNIT_QUESTION_LABEL[u]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">Paguei</span>
              <CurrencyInput
                value={packagePrice}
                onChange={setPackagePrice}
                placeholder="R$"
                className="w-24 shrink-0 rounded-xl border border-border px-2 py-1.5 text-sm"
              />
              <span className="shrink-0 text-xs text-muted-foreground">por</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(e.target.value)}
                placeholder="Qtd."
                className="w-16 shrink-0 rounded-xl border border-border px-2 py-1.5 text-sm"
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                {unit === "un" ? (packageQuantityNum === 1 ? "unidade" : "unidades") : UNIT_LABEL[unit]}
              </span>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar ingrediente
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
        <span>
          Custo (CMV): <strong className="text-foreground">{currency(cmv)}</strong>
        </span>
        {price != null && price > 0 && (
          <>
            <span>
              Preço: <strong className="text-foreground">{currency(price)}</strong>
            </span>
            <span>
              Margem:{" "}
              <strong className={margin !== null && margin < 0 ? "text-destructive" : "text-success"}>
                {margin?.toFixed(1)}%
              </strong>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
