import { supabase } from "./supabase";

// Client ID de "SIGMA PDV" no Google Cloud — não é segredo (client IDs OAuth
// de app web são públicos por design, ficam embutidos no JS do navegador).
const GOOGLE_CLIENT_ID = "822199345734-8r96ufghv17hei3dje1dl2jrf4bl0moo.apps.googleusercontent.com";

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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Login com Google via Google Identity Services (script carregado no
// index.html), em vez do signInWithOAuth (redirect de servidor) do Supabase.
// Esse último mostra o domínio cru do Supabase
// (qedslrbzgklsxcbuokbl.supabase.co) na tela "Escolha uma conta" do Google —
// é o redirect_uri real, e isso não muda com branding/verificação do app (só
// mudaria com o add-on pago de Custom Domain do Supabase). O GSI roda inteiro
// no navegador, sem redirect_uri de servidor, então o Google mostra o próprio
// domínio do app em vez do domínio do Supabase.
export function promptGoogleSignIn(onError: (message: string) => void, onSuccess?: () => void) {
  if (!window.google) {
    onError("O login com Google ainda está carregando — tente de novo em um instante.");
    return;
  }

  const rawNonce = crypto.randomUUID();
  sha256Hex(rawNonce).then((hashedNonce) => {
    window.google!.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      use_fedcm_for_prompt: true,
      nonce: hashedNonce,
      callback: async (response) => {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
          nonce: rawNonce,
        });
        if (error) {
          onError(error.message);
          return;
        }
        onSuccess?.();
      },
    });
    window.google!.accounts.id.prompt();
  });
}
