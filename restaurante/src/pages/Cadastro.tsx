import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, X as XIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import sigmaLogo from "../assets/sigma-logo.png";

type InviteState = "checking" | "valid" | "invalid";
type SlugStatus = "idle" | "checking" | "available" | "taken";

const APEX_DOMAIN = import.meta.env.VITE_APEX_DOMAIN || "assessoriasigma.com.br";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Cadastro() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [inviteState, setInviteState] = useState<InviteState>("checking");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Passo 1 — dados do restaurante
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [establishmentPhone, setEstablishmentPhone] = useState("");

  // Passo 2 — link (slug)
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const slugCheckRef = useRef(0);

  // Passo 3 — conta de acesso
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
      const body = data as { valid?: boolean; restaurantId?: string } | null;
      const valid = !checkError && body?.valid === true;
      setInviteState(valid ? "valid" : "invalid");
      setRestaurantId(valid ? (body?.restaurantId ?? null) : null);
    });
  }, [token]);

  // O slug segue o nome digitado até o dono editar o campo do link na mão —
  // depois disso, para de sobrescrever (mesmo comportamento do trigger no banco:
  // só auto-gera enquanto ninguém escolheu um valor próprio).
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  useEffect(() => {
    const candidate = slugify(slug);
    if (!candidate) {
      setSlugStatus("idle");
      return;
    }
    const requestId = ++slugCheckRef.current;
    setSlugStatus("checking");
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from("restaurants").select("id").eq("slug", candidate).maybeSingle();
      if (slugCheckRef.current !== requestId) return; // resposta antiga, uma digitação mais nova já está em andamento
      const taken = !!data && data.id !== restaurantId;
      setSlugStatus(taken ? "taken" : "available");
    }, 400);
    return () => clearTimeout(timeout);
  }, [slug, restaurantId]);

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
    if (slugStatus === "taken") {
      setError("Esse link já está em uso — escolha outro.");
      return;
    }

    setSubmitting(true);
    const { error: completeError } = await supabase.functions.invoke("complete-invite", {
      body: {
        token,
        email,
        password,
        name: name.trim(),
        cnpj: cnpj.trim(),
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        establishment_phone: establishmentPhone.trim(),
        slug,
      },
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

  const inputClass =
    "mb-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary";
  const labelClass = "mb-1 block text-sm font-medium";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-elevated">
        <img src={sigmaLogo} alt="" className="mb-3 h-10 w-10" />
        <h1 className="mb-1 text-2xl font-bold">Complete seu cadastro</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Preencha os dados do restaurante, escolha seu link e crie seu login.
        </p>

        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Passo 1 — Dados do restaurante
        </h2>

        <label className={labelClass} htmlFor="name">
          Nome do restaurante
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />

        <label className={labelClass} htmlFor="cnpj">
          CNPJ
        </label>
        <input
          id="cnpj"
          type="text"
          required
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          value={cnpj}
          onChange={(event) => setCnpj(event.target.value)}
          className={inputClass}
        />

        <label className={labelClass} htmlFor="contactName">
          Nome do dono
        </label>
        <input
          id="contactName"
          type="text"
          required
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          className={inputClass}
        />

        <label className={labelClass} htmlFor="contactPhone">
          Telefone do dono
        </label>
        <input
          id="contactPhone"
          type="tel"
          required
          placeholder="(00) 00000-0000"
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
          className={inputClass}
        />

        <label className={labelClass} htmlFor="establishmentPhone">
          Telefone do estabelecimento
        </label>
        <input
          id="establishmentPhone"
          type="tel"
          required
          placeholder="(00) 00000-0000"
          value={establishmentPhone}
          onChange={(event) => setEstablishmentPhone(event.target.value)}
          className={inputClass}
        />

        <h2 className="mb-3 mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Passo 2 — Configure seu link
        </h2>

        <label className={labelClass} htmlFor="slug">
          Link do seu cardápio
        </label>
        <input
          id="slug"
          type="text"
          required
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mb-4 mt-1.5 flex items-center gap-1.5 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {slugify(slug) || "seu-link"}.{APEX_DOMAIN}
          </span>
          {slugStatus === "checking" && <span className="shrink-0 text-muted-foreground">verificando...</span>}
          {slugStatus === "available" && (
            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-emerald-600">
              <Check className="h-3.5 w-3.5" aria-hidden /> disponível
            </span>
          )}
          {slugStatus === "taken" && (
            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-destructive">
              <XIcon className="h-3.5 w-3.5" aria-hidden /> já em uso
            </span>
          )}
        </div>

        <h2 className="mb-3 mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Passo 3 — Sua conta de acesso
        </h2>

        <label className={labelClass} htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />

        <label className={labelClass} htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />

        <label className={labelClass} htmlFor="confirmPassword">
          Confirmar senha
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={inputClass}
        />

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting || slugStatus === "taken" || slugStatus === "checking"}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-60"
        >
          {submitting ? "Salvando..." : "Concluir cadastro"}
        </button>
      </form>
    </div>
  );
}
