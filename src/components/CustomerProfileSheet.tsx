import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { addressIcon, useCustomerAddresses } from "../lib/customerAddresses";

const ADDRESS_LABEL_OPTIONS = ["Casa", "Trabalho", "Outro"];

// Sem foto de propósito — o cadastro (CustomerAuthModal) também não pede.
// Seções separadas (cada uma com seu próprio estado de salvar/mensagem/erro),
// mesmo padrão de restaurante/src/pages/Configuracoes.tsx.
export function CustomerProfileSheet({ onClose }: { onClose: () => void }) {
  const { profile, isRealCustomer } = useSession();
  const { addresses, saveAddress, updateAddress, deleteAddress, reload: reloadAddresses } = useCustomerAddresses();

  if (!isRealCustomer || !profile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-6">
      {/* Sem max-w abaixo do sm: — encosta nas duas bordas igual bottom
          sheet nativo (em vez de flutuar com vão dos dois lados, que era o
          caso antes em telas de 384–448px, boa parte dos celulares reais). */}
      <div className="surface-card flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl sm:pb-6">
        {/* Alça só decorativa (afordance de bottom sheet); some no desktop
            junto com o resto do tratamento de modal centralizado. */}
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="mb-4 flex items-center justify-between px-5 pt-3.5 sm:px-6 sm:pt-6">
          <h2 className="text-lg font-bold">Meu perfil</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="press -mr-1.5 grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 px-5 sm:px-6">
          <PersonalDataSection profileId={profile.id} initialName={profile.full_name ?? ""} initialPhone={profile.phone ?? ""} />

          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">E-mail</h3>
            <p className="text-sm">{profile.email ?? "—"}</p>
          </div>

          <PasswordSection />

          <AddressesSection
            addresses={addresses}
            onSave={async (text, label) => {
              await saveAddress(text, label);
              reloadAddresses();
            }}
            onUpdate={async (id, patch) => {
              await updateAddress(id, patch);
              reloadAddresses();
            }}
            onDelete={async (id) => {
              await deleteAddress(id);
              reloadAddresses();
            }}
          />

          <button
            onClick={() => {
              supabase.auth.signOut();
              onClose();
            }}
            className="press w-full rounded-full border border-border py-3 text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

function PersonalDataSection({
  profileId,
  initialName,
  initialPhone,
}: {
  profileId: string;
  initialName: string;
  initialPhone: string;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() }).eq("id", profileId);
    setSaving(false);
    setMessage("Salvo.");
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Dados pessoais</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Telefone"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="press rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setMessage(null);
    if (!password || password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setMessage("Senha alterada.");
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Senha</h3>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Nova senha"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirmar senha"
        className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
      />
      <button
        onClick={handleSave}
        disabled={saving || !password}
        className="press rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando..." : "Trocar senha"}
      </button>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Componente-wrapper só porque JSX não aceita `{addressIcon(x)}` direto como
// tag — precisa de um identificador de componente.
function AddressRowIcon({ label }: { label: string | null }) {
  const Icon = addressIcon(label);
  return <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function AddressesSection({
  addresses,
  onSave,
  onUpdate,
  onDelete,
}: {
  addresses: { id: string; label: string | null; address_text: string }[];
  onSave: (text: string, label: string | null) => Promise<void>;
  onUpdate: (id: string, patch: { label?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  async function handleAdd() {
    if (!newText.trim()) return;
    await onSave(newText, newLabel || null);
    setNewText("");
    setNewLabel("");
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Endereços salvos</h3>

      {addresses.map((address) => (
        <div key={address.id} className="rounded-xl border border-border p-2.5">
          {editingId === address.id ? (
            <div className="space-y-1.5">
              <input
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                placeholder="Nome do endereço"
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    await onUpdate(address.id, { label: editingLabel.trim() || null });
                    setEditingId(null);
                  }}
                  className="press rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="press rounded-full border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <AddressRowIcon label={address.label} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{address.label || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{address.address_text}</p>
                </div>
              </div>
              <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-0.5">
                <button
                  onClick={() => {
                    setEditingId(address.id);
                    setEditingLabel(address.label ?? "");
                  }}
                  className="press rounded-full px-2.5 py-2 text-[11px] font-bold text-primary hover:bg-primary/10"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(address.id)}
                  aria-label="Apagar endereço"
                  className="press grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="space-y-1.5 rounded-xl border border-border p-2.5">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Rua, número, complemento"
            rows={2}
            className="w-full resize-none rounded-lg border border-border px-2.5 py-1.5 text-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {ADDRESS_LABEL_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setNewLabel(option)}
                className={`press rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                  newLabel === option ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nome do endereço (opcional)"
            className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="press rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              Salvar endereço
            </button>
            <button
              onClick={() => setAdding(false)}
              className="press rounded-full border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="press w-full rounded-full border border-border py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          + Adicionar endereço
        </button>
      )}
    </div>
  );
}
