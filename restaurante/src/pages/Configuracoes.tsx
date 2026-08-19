import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { DAY_LABELS, useRestaurantSettings, type BusinessHour } from "../lib/restaurantSettings";

export function Configuracoes() {
  const { session, profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { orderingEnabled, hours, loading, setOrderingEnabled, saveHours } = useRestaurantSettings(restaurantId);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">Configurações</h2>
      <AccountSection currentEmail={session?.user.email ?? ""} />
      <OrderingSection enabled={orderingEnabled} loading={loading} onChange={setOrderingEnabled} />
      <HoursSection hours={hours} loading={loading} onSave={saveHours} />
    </div>
  );
}

function AccountSection({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleChangeEmail() {
    setEmailError(null);
    setEmailMessage(null);
    if (!email.trim() || email === currentEmail) return;
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setEmailSaving(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailMessage("Enviamos um link de confirmação pro e-mail novo e pro antigo — o e-mail só troca depois de confirmar.");
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordMessage(null);
    if (!password || password !== confirmPassword) {
      setPasswordError("As senhas não coincidem.");
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordSaving(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setPasswordMessage("Senha alterada.");
  }

  return (
    <section className="surface-card space-y-5 p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Conta de acesso</h3>

      <div className="space-y-2">
        <label className="block text-sm font-medium">E-mail de login</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleChangeEmail}
            disabled={emailSaving || !email.trim() || email === currentEmail}
            className="press shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {emailSaving ? "Enviando…" : "Trocar e-mail"}
          </button>
        </div>
        {emailMessage && <p className="text-xs text-success">{emailMessage}</p>}
        {emailError && <p className="text-xs text-destructive">{emailError}</p>}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <label className="block text-sm font-medium">Nova senha</label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha"
            className="rounded-xl border border-border px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar senha"
            className="rounded-xl border border-border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleChangePassword}
          disabled={passwordSaving || !password}
          className="press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {passwordSaving ? "Salvando…" : "Trocar senha"}
        </button>
        {passwordMessage && <p className="text-xs text-success">{passwordMessage}</p>}
        {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
      </div>
    </section>
  );
}

function OrderingSection({
  enabled,
  loading,
  onChange,
}: {
  enabled: boolean;
  loading: boolean;
  onChange: (enabled: boolean) => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    setSaving(true);
    const err = await onChange(!enabled);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <section className="surface-card p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Cardápio</h3>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{enabled ? "Cardápio ativo" : "Cardápio desativado"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled
              ? "Clientes podem ver o cardápio e fazer pedidos normalmente."
              : "O cardápio público mostra que o restaurante está fechado e não aceita pedidos novos."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={loading || saving}
          onClick={handleToggle}
          className={`relative h-7 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-8" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}

function HoursSection({
  hours,
  loading,
  onSave,
}: {
  hours: BusinessHour[];
  loading: boolean;
  onSave: (hours: BusinessHour[]) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<BusinessHour[]>(hours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  if (!loadedOnce && !loading) {
    setLoadedOnce(true);
    setDraft(hours);
  }

  function updateDay(day: number, patch: Partial<BusinessHour>) {
    setSaved(false);
    setDraft((prev) => prev.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) setError(err);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  return (
    <section className="surface-card p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Horário de funcionamento</h3>
      <div className="space-y-2">
        {draft.map((day) => (
          <div key={day.day_of_week} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
            <span className="w-20 shrink-0 text-sm font-medium">{DAY_LABELS[day.day_of_week]}</span>
            {day.closed ? (
              <span className="flex-1 text-xs text-muted-foreground">Fechado</span>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="time"
                  value={day.opens_at ?? ""}
                  onChange={(e) => updateDay(day.day_of_week, { opens_at: e.target.value })}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="time"
                  value={day.closes_at ?? ""}
                  onChange={(e) => updateDay(day.day_of_week, { closes_at: e.target.value })}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs"
                />
              </div>
            )}
            <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={day.closed}
                onChange={(e) => updateDay(day.day_of_week, { closed: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Fechado nesse dia
            </label>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="press mt-4 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {saved && <CheckCircle2 className="h-4 w-4" aria-hidden />}
        {saving ? "Salvando…" : saved ? "Salvo" : "Salvar horários"}
      </button>
    </section>
  );
}
