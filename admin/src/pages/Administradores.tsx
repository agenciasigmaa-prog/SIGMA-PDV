import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const target = new Date(expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secondsLeft;
}

export function Administradores() {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const secondsLeft = useCountdown(expiresAt);
  const expired = secondsLeft === 0;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setCopied(false);
    const { data, error: inviteError } = await supabase.functions.invoke("admin-create-admin-invite", { body: {} });
    setGenerating(false);
    if (inviteError) {
      setError(await describeFunctionError(inviteError));
      return;
    }
    const body = data as { invite_link: string; expires_at: string };
    setInviteLink(body.invite_link);
    setExpiresAt(body.expires_at);
  }

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Administradores</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Gere um link temporário e de uso único (válido por 10 minutos) pra dar acesso de admin a alguém. Depois de
        usado, o link fica inativo para sempre.
      </p>

      <div className="max-w-lg rounded-2xl bg-card p-5 shadow-card">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-60"
        >
          {generating ? "Gerando..." : "Gerar link de convite"}
        </button>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {inviteLink && (
          <div className="mt-4">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{inviteLink}</span>
              <button
                onClick={handleCopy}
                disabled={expired ?? false}
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-105 disabled:opacity-40"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className={`mt-2 text-xs font-semibold ${expired ? "text-destructive" : "text-muted-foreground"}`}>
              {expired
                ? "Expirado — gere um novo link."
                : secondsLeft !== null
                  ? `Expira em ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                  : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
