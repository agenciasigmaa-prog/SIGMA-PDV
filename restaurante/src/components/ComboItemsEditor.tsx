import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ComboItemLine } from "../lib/comboItems";
import type { Product } from "../lib/menu";

export function ComboItemsEditor({
  catalog,
  lines,
  onChange,
}: {
  catalog: Product[];
  lines: ComboItemLine[];
  onChange: (lines: ComboItemLine[]) => void;
}) {
  const datalistId = useId();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const matched = catalog.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  function handleAdd() {
    const quantityUsed = Number(quantity);
    if (!matched) {
      setError("Escolha um produto que já existe no cardápio.");
      return;
    }
    if (!quantityUsed || quantityUsed <= 0) {
      setError("Informe a quantidade.");
      return;
    }

    const existingIndex = lines.findIndex((line) => line.component_product_id === matched.id);
    if (existingIndex >= 0) {
      const next = [...lines];
      next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + quantityUsed };
      onChange(next);
    } else {
      onChange([...lines, { component_product_id: matched.id, name: matched.name, quantity: quantityUsed }]);
    }
    setName("");
    setQuantity("1");
    setError(null);
  }

  function handleRemove(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function handleQuantityChange(index: number, rawValue: string) {
    const next = [...lines];
    next[index] = { ...next[index], quantity: rawValue === "" ? 0 : Number(rawValue) };
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-sm font-semibold">Itens do combo (opcional)</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Escolha produtos já cadastrados no cardápio pra montar esse combo. O preço continua sendo o de venda deste
        produto, definido acima.
      </p>

      {lines.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {lines.map((line, index) => (
            <li key={line.component_product_id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <input
                type="number"
                min="1"
                value={line.quantity || ""}
                onChange={(e) => handleQuantityChange(index, e.target.value)}
                aria-label={`Quantidade de ${line.name}`}
                className="w-14 rounded-lg border border-border px-1.5 py-1 text-right text-xs"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label={`Remover ${line.name}`}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          list={datalistId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do produto"
          className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm"
        />
        <datalist id={datalistId}>
          {catalog.map((product) => (
            <option key={product.id} value={product.name} />
          ))}
        </datalist>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qtd."
          className="w-16 shrink-0 rounded-xl border border-border px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
