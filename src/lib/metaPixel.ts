// Meta Pixel (Facebook/Instagram Ads) — script oficial do Meta, injetado só
// quando o restaurante tem um ID configurado (restaurant_branding.meta_pixel_id,
// editado na aba Marketing do painel do restaurante). Guardado por pixelId
// pra não reinjetar o <script> nem disparar "PageView" de novo se o efeito
// que chama initMetaPixel rodar mais de uma vez.
type Fbq = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: Fbq;
  callMethod?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const initializedPixelIds = new Set<string>();

export function initMetaPixel(pixelId: string) {
  if (!pixelId || initializedPixelIds.has(pixelId)) return;
  initializedPixelIds.add(pixelId);

  if (!window.fbq) {
    const fbq: Fbq = (...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    };
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

// Disparado quando o cliente toca em "Revisar pedido" no carrinho — é o
// ponto em que ele decide seguir pra confirmar de verdade (não em cada
// abertura do carrinho, que dispararia à toa toda vez que só desse uma
// olhada). Sem efeito se o pixel nunca foi inicializado.
export function trackInitiateCheckout(value: number) {
  window.fbq?.("track", "InitiateCheckout", { value, currency: "BRL" });
}

// Disparado na confirmação do pedido (não só ao carregar a página) — é o que
// deixa o anúncio ser otimizado pra quem realmente compra, não só quem
// visita o cardápio. Sem efeito se o pixel nunca foi inicializado.
export function trackPurchase(value: number) {
  window.fbq?.("track", "Purchase", { value, currency: "BRL" });
}
