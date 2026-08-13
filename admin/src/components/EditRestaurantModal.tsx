import { type FormEvent, useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import type { Restaurant } from "../lib/restaurant";

type OwnerInfo = { user_id: string; email: string; full_name: string | null; phone: string | null };

export function EditRestaurantModal({
  restaurant,
  onClose,
  onSaved,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetCopied, setResetCopied] = useState(false);

  useEffect(() => {
    supabase.functions
      .invoke("admin-manage-owner", { body: { action: "get_owner", restaurant_id: restaurant.id } })
      .then(async ({ data, error }) => {
        if (error) setOwnerError(await describeFunctionError(error));
        else setOwner(data as OwnerInfo);
        setLoadingOwner(false);
      });
  }, [restaurant.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const contact_name = String(form.get("contact_name") ?? "");
    const contact_email = String(form.get("contact_email") ?? "");
    const contact_phone = String(form.get("contact_phone") ?? "");
    const ownerEmail = String(form.get("owner_email") ?? "");
    const ownerFullName = String(form.get("owner_full_name") ?? "");
    const ownerPhone = String(form.get("owner_phone") ?? "");
    const ownerPassword = String(form.get("owner_password") ?? "");

    const { error: restaurantError } = await supabase
      .from("restaurants")
      .update({ name, contact_name, contact_email, contact_phone })
      .eq("id", restaurant.id);

    if (restaurantError) {
      setSaving(false);
      setSaveError(restaurantError.message);
      return;
    }

    const { error: ownerUpdateError } = await supabase.functions.invoke("admin-manage-owner", {
      body: {
        action: "update_owner",
        restaurant_id: restaurant.id,
        ...(ownerEmail && ownerEmail !== owner?.email ? { email: ownerEmail } : {}),
        ...(ownerPassword ? { password: ownerPassword } : {}),
        full_name: ownerFullName,
        phone: ownerPhone,
      },
    });

    setSaving(false);
    if (ownerUpdateError) {
      setSaveError(await describeFunctionError(ownerUpdateError));
      return;
    }

    onSaved();
    onClose();
  }

  async function handleGenerateResetLink() {
    if (!owner) return;
    setResetError(null);
    setResetLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-reset-password", {
      body: { user_id: owner.user_id, email: owner.email, restaurant_id: restaurant.id },
    });
    setResetLoading(false);
    if (error) {
      setResetError(await describeFunctionError(error));
      return;
    }
    setResetLink((data as { action_link: string }).action_link);
  }

  async function handleCopyResetLink() {
    if (!resetLink) return;
    await navigator.clipboard.writeText(resetLink);
    setResetCopied(true);
    setTimeout(() => setResetCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Editar {restaurant.name}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Restaurante</legend>
            <input name="name" defaultValue={restaurant.name} required placeholder="Nome" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="contact_name" defaultValue={restaurant.contact_name ?? ""} placeholder="Nome do contato" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="contact_phone" defaultValue={restaurant.contact_phone ?? ""} placeholder="Telefone" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="contact_email" type="email" defaultValue={restaurant.contact_email ?? ""} placeholder="E-mail de contato" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Conta do dono (login)</legend>
            {loadingOwner ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : ownerError ? (
              <p className="text-sm text-destructive">{ownerError}</p>
            ) : (
              <>
                <input name="owner_full_name" defaultValue={owner?.full_name ?? ""} placeholder="Nome do dono" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
                <input name="owner_phone" defaultValue={owner?.phone ?? ""} placeholder="Telefone do dono" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
                <input name="owner_email" type="email" defaultValue={owner?.email ?? ""} placeholder="E-mail de login" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
                <input name="owner_password" type="password" placeholder="Nova senha (deixe em branco pra não alterar)" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />

                <button
                  type="button"
                  onClick={handleGenerateResetLink}
                  disabled={resetLoading}
                  className="w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                >
                  {resetLoading ? "Gerando link..." : "Gerar link de redefinição de senha"}
                </button>

                {resetError && <p className="text-xs text-destructive">{resetError}</p>}

                {resetLink && (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{resetLink}</span>
                    <button
                      type="button"
                      onClick={handleCopyResetLink}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-105"
                    >
                      {resetCopied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                      {resetCopied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                )}
              </>
            )}
          </fieldset>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <button
            type="submit"
            disabled={saving || loadingOwner}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}
