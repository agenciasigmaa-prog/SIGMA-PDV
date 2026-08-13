import { type FormEvent, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";

export function ManualRestaurantModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const owner_email = String(form.get("owner_email") ?? "");
    const owner_password = String(form.get("owner_password") ?? "");

    const { error } = await supabase.functions.invoke("admin-create-restaurant", {
      body: {
        name: form.get("name"),
        owner_email,
        owner_password,
        contact_name: form.get("contact_name"),
        contact_email: form.get("contact_email"),
        contact_phone: form.get("contact_phone"),
      },
    });

    setSubmitting(false);
    if (error) {
      setFormError(await describeFunctionError(error));
      return;
    }

    setCreated({ email: owner_email, password: owner_password });
    onCreated?.();
  }

  async function handleCopy() {
    if (!created) return;
    await navigator.clipboard.writeText(`E-mail: ${created.email}\nSenha: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{created ? "Conta criada" : "Adicionar restaurante manualmente"}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {created ? (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Conta do dono já criada e ativa. Anote ou copie as credenciais pra repassar pro cliente.
            </p>
            <div className="mb-4 space-y-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm">
              <p>
                <span className="text-muted-foreground">E-mail:</span> {created.email}
              </p>
              <p>
                <span className="text-muted-foreground">Senha:</span> {created.password}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copiado" : "Copiar credenciais"}
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
            >
              Concluir
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-2">
            <input name="name" required placeholder="Nome do restaurante" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="owner_email" required type="email" placeholder="E-mail do dono (login)" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="owner_password" required type="text" minLength={6} placeholder="Senha do dono (mín. 6 caracteres)" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="contact_name" placeholder="Nome do contato" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="contact_phone" placeholder="Telefone" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            <input name="contact_email" type="email" placeholder="E-mail de contato" className="w-full rounded-xl border border-border px-3 py-2 text-sm" />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Criando..." : "Criar conta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
