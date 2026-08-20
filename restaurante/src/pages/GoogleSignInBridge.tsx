import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// Ponte de login Google pro storefront do cliente (src/components/CustomerAuthModal.tsx
// no app raiz), que roda em subdomínios ilimitados (*.assessoriasigma.com.br) — o Google
// não aceita "origem coringa" em Origens JavaScript autorizadas, só domínios fixos, então
// o Google Identity Services não pode rodar direto lá. Essa página roda aqui, num domínio
// fixo já autorizado (app.assessoriasigma.com.br), aberta como popup pelo storefront; faz
// o login do Google aqui dentro e devolve só o credential (não a sessão) pra aba de
// origem via postMessage, que aí sim chama signInWithIdToken no próprio domínio dela —
// é o storefront quem estabelece a sessão, não essa página.
//
// Só aceita devolver o resultado pra origens *.assessoriasigma.com.br (ou localhost em
// dev) — o parâmetro `origin` vem da aba que abriu o popup, mas nunca é confiado sem essa
// checagem, pra não virar um jeito de vazar o credential pra um domínio arbitrário.
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?assessoriasigma\.com\.br$|^http:\/\/localhost:\d+$/;

const GOOGLE_CLIENT_ID = "822199345734-8r96ufghv17hei3dje1dl2jrf4bl0moo.apps.googleusercontent.com";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function GoogleSignInBridge() {
  const [searchParams] = useSearchParams();
  const nonce = searchParams.get("nonce");
  const targetOrigin = searchParams.get("origin");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const originValid = !!targetOrigin && ALLOWED_ORIGIN.test(targetOrigin);
  const started = useRef(false);

  useEffect(() => {
    if (!nonce || !originValid) {
      setError("Link de login inválido.");
      setStatus("error");
      return;
    }

    // StrictMode monta o efeito duas vezes de propósito (mount → cleanup →
    // mount) — sem essa trava, o segundo initialize()+prompt() cancela o
    // pedido FedCM do primeiro (AbortError), e o Google nunca chega a abrir.
    if (started.current) return;
    started.current = true;

    let cancelled = false;

    sha256Hex(nonce).then((hashedNonce) => {
      if (cancelled) return;
      if (!window.google) {
        setError("Não consegui carregar o login do Google. Feche esta janela e tente de novo.");
        setStatus("error");
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        use_fedcm_for_prompt: true,
        nonce: hashedNonce,
        callback: (response) => {
          window.opener?.postMessage(
            { type: "cardapio-sig-google-credential", credential: response.credential },
            targetOrigin,
          );
          window.close();
        },
      });
      window.google.accounts.id.prompt();
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [nonce, originValid, targetOrigin]);

  function handleRetry() {
    if (!window.google) return;
    window.google.accounts.id.prompt();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      {status === "error" ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {status === "loading" ? "Carregando..." : "Escolha sua conta Google na janela que abriu."}
          </p>
          {status === "ready" && (
            <button
              onClick={handleRetry}
              className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
            >
              Não abriu? Clique aqui
            </button>
          )}
        </>
      )}
    </div>
  );
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            nonce?: string;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}
