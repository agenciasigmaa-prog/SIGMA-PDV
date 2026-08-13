import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";

export function NewRestaurantModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const requested = useRef(false);

  useEffect(() => {
    // Guarda por ref (não por flag de cleanup): em StrictMode dev o efeito roda duas
    // vezes e a limpeza da primeira rodada dispara antes da fetch responder — se a
    // callback checasse uma flag "cancelled" fechada nessa primeira closure, o modal
    // ficava preso em "Gerando link..." pra sempre mesmo com a criação já concluída.
    if (requested.current) return;
    requested.current = true;

    supabase.functions.invoke("admin-create-restaurant", { body: {} }).then(async ({ data, error }) => {
      if (error) {
        setError(await describeFunctionError(error));
        setCreating(false);
        return;
      }
      setInviteLink((data as { invite_link: string }).invite_link);
      setCreating(false);
      onCreated?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDone() {
    onClose();
    navigate("/kanban");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{inviteLink ? "Restaurante criado" : "Novo restaurante"}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {creating && <p className="text-sm text-muted-foreground">Gerando link...</p>}

        {!creating && error && (
          <div>
            <p className="mb-4 text-sm text-destructive">{error}</p>
            <button
              onClick={onClose}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
            >
              Fechar
            </button>
          </div>
        )}

        {!creating && inviteLink && (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Copie o link abaixo e mande pro dono do restaurante (WhatsApp, e-mail, etc). Ao abrir, ele cadastra o
              próprio e-mail e senha e já entra logado.
            </p>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{inviteLink}</span>
              <button
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-105"
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <button
              onClick={handleDone}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
