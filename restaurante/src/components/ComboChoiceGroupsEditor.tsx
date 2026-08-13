import { useId, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ComboChoiceGroupLine } from "../lib/comboChoiceGroups";
import type { Product } from "../lib/menu";

function ChoiceGroupCard({
  group,
  catalog,
  onChange,
  onRemove,
}: {
  group: ComboChoiceGroupLine;
  catalog: Product[];
  onChange: (group: ComboChoiceGroupLine) => void;
  onRemove: () => void;
}) {
  const datalistId = useId();
  const [optionName, setOptionName] = useState("");
  const matched = catalog.find((p) => p.name.trim().toLowerCase() === optionName.trim().toLowerCase());

  function handleAddOption() {
    if (!matched) return;
    if (group.options.some((o) => o.product_id === matched.id)) {
      setOptionName("");
      return;
    }
    onChange({ ...group, options: [...group.options, { product_id: matched.id, name: matched.name }] });
    setOptionName("");
  }

  function handleRemoveOption(productId: string) {
    onChange({ ...group, options: group.options.filter((o) => o.product_id !== productId) });
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={group.name}
          onChange={(e) => onChange({ ...group, name: e.target.value })}
          placeholder='Nome do grupo (ex: "Escolha o hambúrguer")'
          className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Excluir grupo"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {group.options.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {group.options.map((option) => (
            <li key={option.product_id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveOption(option.product_id)}
                aria-label={`Remover ${option.name}`}
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
          value={optionName}
          onChange={(e) => setOptionName(e.target.value)}
          placeholder="Nome do produto (opção)"
          className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm"
        />
        <datalist id={datalistId}>
          {catalog.map((product) => (
            <option key={product.id} value={product.name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={handleAddOption}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ComboChoiceGroupsEditor({
  catalog,
  groups,
  onChange,
}: {
  catalog: Product[];
  groups: ComboChoiceGroupLine[];
  onChange: (groups: ComboChoiceGroupLine[]) => void;
}) {
  function handleAddGroup() {
    onChange([...groups, { id: crypto.randomUUID(), name: "", options: [] }]);
  }

  function handleUpdateGroup(index: number, group: ComboChoiceGroupLine) {
    onChange(groups.map((g, i) => (i === index ? group : g)));
  }

  function handleRemoveGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-sm font-semibold">Grupos de escolha (opcional)</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Cliente escolhe 1 produto de cada grupo antes de adicionar o combo ao carrinho — o preço continua sendo o de
        venda deste produto, não muda pela escolha.
      </p>

      {groups.length > 0 && (
        <div className="mb-3 space-y-3">
          {groups.map((group, index) => (
            <ChoiceGroupCard
              key={group.id}
              group={group}
              catalog={catalog}
              onChange={(g) => handleUpdateGroup(index, g)}
              onRemove={() => handleRemoveGroup(index)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddGroup}
        className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Grupo de escolha
      </button>
    </div>
  );
}
