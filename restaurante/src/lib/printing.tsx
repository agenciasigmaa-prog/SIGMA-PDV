import { createRoot, type Root } from "react-dom/client";
import { TicketPrintView } from "../components/TicketPrintView";
import type { IncomingOrder } from "./orders";

export type PaperWidth = "58mm" | "80mm" | "88mm";

export const PAPER_WIDTH_OPTIONS: { value: PaperWidth; label: string }[] = [
  { value: "58mm", label: "58mm" },
  { value: "80mm", label: "80mm" },
  { value: "88mm", label: "88mm" },
];

const PAPER_WIDTH_STORAGE_KEY = "sigma:paper-width";
const AUTO_PRINT_STORAGE_KEY = "sigma:auto-print";

export function getStoredPaperWidth(): PaperWidth {
  const saved = localStorage.getItem(PAPER_WIDTH_STORAGE_KEY);
  return saved === "58mm" || saved === "80mm" || saved === "88mm" ? saved : "80mm";
}

export function setStoredPaperWidth(width: PaperWidth): void {
  localStorage.setItem(PAPER_WIDTH_STORAGE_KEY, width);
  applyPageSize(width);
}

// Impressão automática vem ligada por padrão — é o comportamento que o
// funcionário espera (comanda sai sozinha); só desliga quem entrar na tela
// de Impressão e escolher explicitamente.
export function getAutoPrintEnabled(): boolean {
  return localStorage.getItem(AUTO_PRINT_STORAGE_KEY) !== "off";
}

export function setAutoPrintEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_PRINT_STORAGE_KEY, enabled ? "on" : "off");
}

// A largura da bobina afeta o tamanho físico da página impressa — no Chromium
// isso só funciona via uma regra @page estática no CSS, não dá pra passar por
// variável CSS. Por isso injeta/atualiza uma <style> própria em vez de usar
// index.css direto.
let pageSizeStyle: HTMLStyleElement | null = null;
function applyPageSize(width: PaperWidth): void {
  if (!pageSizeStyle) {
    pageSizeStyle = document.createElement("style");
    pageSizeStyle.id = "sigma-ticket-page-size";
    document.head.appendChild(pageSizeStyle);
  }
  pageSizeStyle.textContent = `@page { size: ${width} auto; margin: 0; }`;

  const container = getContainer();
  container.style.width = width;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
function getContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement("div");
    container.id = "print-ticket";
    document.body.appendChild(container);
    root = createRoot(container);
  }
  return container;
}

applyPageSize(getStoredPaperWidth());

// Só existe dentro do wrapper nativo (printer-app/, ver README na raiz do
// repo) — um shell WebView2 que embute essa mesma tela e imprime via API
// nativa (CoreWebView2.PrintAsync) sem diálogo nenhum. Fora dele (navegador
// comum, ex. em desenvolvimento), cai pro window.print() padrão.
declare global {
  interface Window {
    chrome?: { webview?: { postMessage: (message: string) => void } };
  }
}

// Dispara a impressão da comanda: atualiza o conteúdo do ticket escondido
// (#print-ticket, ver index.css) e manda imprimir — pelo wrapper nativo se
// disponível, senão pelo diálogo normal do navegador. Chamada tanto pelo
// board de Pedidos (automática em pedido novo, ou pelo botão manual) quanto
// pelo botão "Imprimir teste" da tela de Configuração de Impressão.
export function printTicket(order: IncomingOrder): void {
  getContainer();
  applyPageSize(getStoredPaperWidth());
  root!.render(<TicketPrintView order={order} />);

  // Precisa esperar o React commitar o novo conteúdo no DOM antes de mandar
  // imprimir — senão a comanda sai com o pedido anterior (ou em branco, na
  // primeira chamada).
  requestAnimationFrame(() => {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage(JSON.stringify({ type: "print-ticket" }));
    } else {
      window.print();
    }
  });
}
