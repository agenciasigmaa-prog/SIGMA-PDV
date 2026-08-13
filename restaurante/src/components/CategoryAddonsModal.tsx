import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import type { Addon, AddonGroup } from "../lib/addonGroups";
import type { Category } from "../lib/menu";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AddonGroupCard({
  group,
  addons,
  onUpdateGroup,
  onDeleteGroup,
  onCreateAddon,
  onUpdateAddon,
  onDeleteAddon,
}: {
  group: AddonGroup;
  addons: Addon[];
  onUpdateGroup: (patch: { name?: string; required?: boolean }) => void;
  onDeleteGroup: () => void;
  onCreateAddon: (input: { name: string; price: number }) => void;
  onUpdateAddon: (id: string, input: Partial<Pick<Addon, "name" | "price" | "active">>) => void;
  onDeleteAddon: (id: string) => void;
}) {
  const [name, setName] = useState(group.name);
  const [newAddonName, setNewAddonName] = useState("");
  const [newAddonPrice, setNewAddonPrice] = useState<number | null>(null);

  function handleAddAddon() {
    if (!newAddonName.trim() || newAddonPrice == null) return;
    onCreateAddon({ name: newAddonName.trim(), price: newAddonPrice });
    setNewAddonName("");
    setNewAddonPrice(null);
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== group.name) onUpdateGroup({ name: name.trim() });
          }}
          className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 text-sm font-semibold"
        />
        <button
          onClick={onDeleteGroup}
          aria-label={`Excluir grupo ${group.name}`}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={group.required}
          onChange={(e) => onUpdateGroup({ required: e.target.checked })}
        />
        Obrigatório (cliente precisa escolher pelo menos 1)
      </label>

      {addons.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {addons.map((addon) => (
            <li key={addon.id} className="flex items-center gap-2">
              <button
                onClick={() => onUpdateAddon(addon.id, { active: !addon.active })}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  addon.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                }`}
              >
                {addon.active ? "Ativo" : "Inativo"}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm">{addon.name}</span>
              <span className="shrink-0 text-xs font-semibold">{currency(addon.price)}</span>
              <button
                onClick={() => onDeleteAddon(addon.id)}
                aria-label={`Excluir ${addon.name}`}
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
          value={newAddonName}
          onChange={(e) => setNewAddonName(e.target.value)}
          placeholder="Nome do adicional"
          className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
        <CurrencyInput
          value={newAddonPrice}
          onChange={setNewAddonPrice}
          placeholder="R$"
          className="w-24 shrink-0 rounded-lg border border-border px-2 py-1.5 text-sm"
        />
        <button
          onClick={handleAddAddon}
          aria-label="Adicionar item"
          className="shrink-0 rounded-full border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function CategoryAddonsModal({
  category,
  groups,
  addons,
  onClose,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onCreateAddon,
  onUpdateAddon,
  onDeleteAddon,
}: {
  category: Category;
  groups: AddonGroup[];
  addons: Addon[];
  onClose: () => void;
  onCreateGroup: (name: string) => void;
  onUpdateGroup: (id: string, patch: { name?: string; required?: boolean }) => void;
  onDeleteGroup: (id: string) => void;
  onCreateAddon: (groupId: string, input: { name: string; price: number }) => void;
  onUpdateAddon: (id: string, input: Partial<Pick<Addon, "name" | "price" | "active">>) => void;
  onDeleteAddon: (id: string) => void;
}) {
  const [newGroupName, setNewGroupName] = useState("");

  function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    onCreateGroup(newGroupName.trim());
    setNewGroupName("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-elevated">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold">Adicionais — {category.name}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Esses grupos valem automaticamente pra todo produto de "{category.name}".
        </p>

        <div className="space-y-4">
          {groups.map((group) => (
            <AddonGroupCard
              key={group.id}
              group={group}
              addons={addons.filter((a) => a.group_id === group.id)}
              onUpdateGroup={(patch) => onUpdateGroup(group.id, patch)}
              onDeleteGroup={() => onDeleteGroup(group.id)}
              onCreateAddon={(input) => onCreateAddon(group.id, input)}
              onUpdateAddon={onUpdateAddon}
              onDeleteAddon={onDeleteAddon}
            />
          ))}

          <div className="flex gap-2 rounded-xl border border-dashed border-border p-3">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nome do novo grupo (ex: Adicionais)"
              className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateGroup}
              className="press flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Grupo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
