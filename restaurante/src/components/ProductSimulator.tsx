import { useState } from "react";
import { Sparkles } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { IngredientsEditor } from "./IngredientsEditor";
import type { Ingredient, ProductIngredientLine } from "../lib/ingredients";
import { totalCmv } from "../lib/ingredients";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProductSimulator({
  catalog,
  onSendToMenu,
}: {
  catalog: Ingredient[];
  onSendToMenu: (draft: { name: string; ingredientLines: ProductIngredientLine[] }) => void;
}) {
  const [name, setName] = useState("");
  const [ingredientLines, setIngredientLines] = useState<ProductIngredientLine[]>([]);
  const [targetPrice, setTargetPrice] = useState<number | null>(null);

  const cmv = totalCmv(ingredientLines);
  const profit = targetPrice != null ? targetPrice - cmv : null;
  const margin = targetPrice != null && targetPrice > 0 ? (profit! / targetPrice) * 100 : null;

  function handleClear() {
    setName("");
    setIngredientLines([]);
    setTargetPrice(null);
  }

  function handleSend() {
    onSendToMenu({ name: name.trim(), ingredientLines });
    handleClear();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-base font-bold">Simulador de produto novo</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Teve uma ideia de produto? Monte os ingredientes aqui e veja o CMV antes de decidir se vale colocar no
          cardápio de verdade.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nome do produto (rascunho)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Burger de costela com geleia de pimenta"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>

          <IngredientsEditor catalog={catalog} lines={ingredientLines} onChange={setIngredientLines} price={targetPrice} />

          <div>
            <label className="mb-1 block text-sm font-medium">Preço que você pensa em cobrar (opcional)</label>
            <CurrencyInput
              value={targetPrice}
              onChange={setTargetPrice}
              placeholder="R$ 0,00"
              className="w-full max-w-[200px] rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border p-3">
          <p className="text-sm">
            Custo (CMV): <strong>{currency(cmv)}</strong>
          </p>
          {targetPrice != null && targetPrice > 0 ? (
            profit! < 0 ? (
              <p className="mt-1 text-sm font-bold text-destructive">
                Prejuízo — você perde {currency(Math.abs(profit!))} por unidade vendida.
              </p>
            ) : (
              <p className="mt-1 text-sm font-bold text-success">
                Vale a pena — {currency(profit!)} de lucro por unidade ({margin!.toFixed(1)}% de margem).
              </p>
            )
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Informe um preço acima pra ver se compensa.
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleClear}
            className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
          >
            Limpar
          </button>
          <button
            onClick={handleSend}
            disabled={!name.trim()}
            className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-50"
          >
            Adicionar ao cardápio
          </button>
        </div>
      </div>
    </div>
  );
}
