import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";

type Mode = "signup" | "login";

// Cadastro/login real do cliente — substitui o antigo signInAnonymously()
// automático (ver MesaCardapio.tsx). O cadastro (email/senha/telefone/
// endereço) fica gravado em `profiles`, que não é escopado por restaurante:
// o mesmo login vale em qualquer /loja/:restaurantId da plataforma, sem
// precisar recadastrar. "Continuar com Google" já está com o código pronto,
// mas só funciona depois que o provider Google for habilitado no painel do
// Supabase (Authentication → Sign In / Providers) — até lá, o Supabase
// retorna erro e ele aparece pro usuário como qualquer outro erro de login.
export function CustomerAuthModal({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNotice, setConfirmNotice] = useState(false);

  async function handleSignup() {
    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), phone: phone.trim(), address: address.trim() } },
    });
    setSubmitting(false);
    if (signUpError) {
      setError(await describeFunctionError(signUpError));
      return;
    }
    // Se o projeto exige confirmação de e-mail, signUp não devolve sessão —
    // não dá pra fazer checkout ainda, precisa confirmar primeiro.
    if (!data.session) {
      setConfirmNotice(true);
      return;
    }
    onAuthenticated();
  }

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (signInError) {
      setError(await describeFunctionError(signInError));
      return;
    }
    onAuthenticated();
  }

  async function handleGoogle() {
    setError(null);
    // signInWithOAuth navega a página inteira pro Google e volta — não dá
    // pra continuar o pedido no mesmo clique. O carrinho já é salvo em
    // localStorage (CartContext), então ao voltar o cliente só precisa
    // clicar em "Confirmar pedido" de novo; não precisa de hack de
    // "pedido pendente" pra sobreviver ao redirect.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (oauthError) setError(await describeFunctionError(oauthError));
  }

  if (confirmNotice) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6">
        <div className="surface-card max-w-sm p-6 text-center">
          <h2 className="text-lg font-bold">Confirme seu e-mail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviamos um link de confirmação pra {email}. Depois de confirmar, volte aqui e entre com sua senha.
          </p>
          <button
            onClick={onClose}
            className="press mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-6">
      <div className="surface-card max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{mode === "signup" ? "Criar cadastro" : "Entrar"}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-full bg-muted p-1">
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold ${mode === "signup" ? "bg-card shadow-card" : "text-muted-foreground"}`}
          >
            Criar cadastro
          </button>
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold ${mode === "login" ? "bg-card shadow-card" : "text-muted-foreground"}`}
          >
            Já tenho conta
          </button>
        </div>

        <button
          onClick={handleGoogle}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted"
        >
          Continuar com Google
        </button>

        <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> ou {mode === "signup" ? "cadastre-se" : "entre"} com e-mail
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-2">
          {mode === "signup" && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
          />
          {mode === "signup" && (
            <>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar senha"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Telefone"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Endereço (opcional)"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              />
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <button
          onClick={mode === "signup" ? handleSignup : handleLogin}
          disabled={
            submitting ||
            !email.trim() ||
            !password ||
            (mode === "signup" && (!name.trim() || !phone.trim() || !confirmPassword || password !== confirmPassword))
          }
          className="press mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {submitting ? "Enviando..." : mode === "signup" ? "Criar cadastro" : "Entrar"}
        </button>
      </div>
    </div>
  );
}
