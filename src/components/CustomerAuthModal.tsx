import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";

type Mode = "signup" | "login";

// Cadastro/login real do cliente — substitui o antigo signInAnonymously()
// automático (ver MesaCardapio.tsx). O cadastro (email/senha/telefone/
// endereço) fica gravado em `profiles`, que não é escopado por restaurante:
// o mesmo login vale em qualquer /loja/:restaurantId da plataforma, sem
// precisar recadastrar. "Continuar com Google" fica lado a lado com o
// cadastro manual (não substitui) — o Google bloqueia OAuth dentro de
// navegadores embutidos (WebView do Instagram/TikTok/Facebook), e o link de
// tráfego pago da aba Marketing é feito pra abrir exatamente nesses apps, então
// só Google deixaria esse cliente sem conseguir logar.
export function CustomerAuthModal({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: (mode: Mode) => void }) {
  const [mode, setMode] = useState<Mode>("login");
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
    onAuthenticated("signup");
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
    onAuthenticated("login");
  }

  function handleGoogle() {
    setError(null);
    // O storefront roda em subdomínios ilimitados (*.assessoriasigma.com.br) — o
    // Google não aceita origem coringa em "Origens JavaScript autorizadas", só
    // domínios fixos. Por isso o login não roda direto aqui: abre um popup na
    // "ponte" (restaurante/src/pages/GoogleSignInBridge.tsx), num domínio fixo já
    // autorizado, que faz o login do Google e devolve só o credential via
    // postMessage — quem estabelece a sessão é esta aba mesmo, no seu próprio
    // domínio, então o localStorage do carrinho/sessão fica no lugar certo.
    const rawNonce = crypto.randomUUID();
    const bridgeUrl = `https://app.assessoriasigma.com.br/google-signin-bridge?nonce=${encodeURIComponent(rawNonce)}&origin=${encodeURIComponent(window.location.origin)}`;
    const popup = window.open(bridgeUrl, "google-signin", "width=460,height=620");
    if (!popup) {
      setError("O navegador bloqueou o popup de login. Permita popups para este site e tente de novo.");
      return;
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== "https://app.assessoriasigma.com.br") return;
      if (event.data?.type !== "cardapio-sig-google-credential") return;
      window.removeEventListener("message", handleMessage);
      supabase.auth
        .signInWithIdToken({ provider: "google", token: event.data.credential, nonce: rawNonce })
        .then(async ({ error: idTokenError }) => {
          if (idTokenError) {
            setError(await describeFunctionError(idTokenError));
            return;
          }
          // Google não distingue cadastro de login no fluxo atual (mesmo
          // botão nas duas abas) — trata como "login": se faltar telefone
          // (Google nunca traz telefone), a regra de telefone obrigatório em
          // MesaCardapio.tsx já força a tela de perfil de qualquer forma.
          onAuthenticated("login");
        });
    }
    window.addEventListener("message", handleMessage);
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
            onClick={() => setMode("login")}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold ${mode === "login" ? "bg-card shadow-card" : "text-muted-foreground"}`}
          >
            Já tenho conta
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-full py-1.5 text-xs font-bold ${mode === "signup" ? "bg-card shadow-card" : "text-muted-foreground"}`}
          >
            Criar cadastro
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
