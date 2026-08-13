import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import sigmaLogo from "../assets/sigma-logo.png";

type InviteState = "checking" | "valid" | "invalid";

export function Cadastro() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [inviteState, setInviteState] = useState<InviteState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteState("invalid");
      return;
    }

    supabase.functions.invoke("check-invite", { body: { token } }).then(({ data, error: checkError }) => {
      const valid = !checkError && (data as { valid?: boolean } | null)?.valid === true;
      setInviteState(valid ? "valid" : "invalid");
    });
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    const { error: completeError } = await supabase.functions.invoke("complete-invite", {
      body: { token, email, password },
    });

    if (completeError) {
      setSubmitting(false);
      setError(await describeFunctionError(completeError));
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate("/bem-vindo", { replace: true });
  }

  if (inviteState === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  if (inviteState === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <img src={sigmaLogo} alt="" className="mx-auto mb-3 h-10 w-10" />
          <p className="mb-2 text-lg font-semibold">Link inválido ou expirado</p>
          <p className="text-sm text-muted-foreground">
            Peça pra agência gerar um novo link de cadastro pro seu restaurante.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-elevated">
        <img src={sigmaLogo} alt="" className="mb-3 h-10 w-10" />
        <h1 className="mb-1 text-2xl font-bold">Complete seu cadastro</h1>
        <p className="mb-6 text-sm text-muted-foreground">Crie seu login pra acessar sua conta daqui pra frente.</p>

        <label className="mb-1 block text-sm font-medium" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />

        <label className="mb-1 block text-sm font-medium" htmlFor="confirmPassword">
          Confirmar senha
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="mb-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-60"
        >
          {submitting ? "Salvando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
