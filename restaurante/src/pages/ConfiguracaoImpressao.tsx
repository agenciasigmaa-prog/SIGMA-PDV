import { useState } from "react";
import { Download, Printer } from "lucide-react";
import {
  getAutoPrintEnabled,
  getStoredPaperWidth,
  printTicket,
  setAutoPrintEnabled,
  setStoredPaperWidth,
  PAPER_WIDTH_OPTIONS,
  type PaperWidth,
} from "../lib/printing";
import type { IncomingOrder } from "../lib/orders";

// Precisa existir de verdade no bucket público do Supabase Storage antes de
// divulgar o link pro restaurante — ver printer-app/README.md pra gerar e
// publicar o .zip. Bucket "sigma-print-app" (nome exato, sem "agent"/"app"
// trocados — já tivemos um bug de link quebrado por causa disso).
//
// O "?v=N" é só pra invalidar cache do navegador do lado do restaurante —
// como a URL do arquivo nunca muda, o Chrome pode reaproveitar um .zip
// antigo já baixado antes mesmo depois de publicar uma versão nova. Bump
// esse número toda vez que reenviar o .zip (ver printer-app/README.md).
const WRAPPER_DOWNLOAD_VERSION = 2;
const WRAPPER_DOWNLOAD_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/sigma-print-app/sigma-print-app.zip?v=${WRAPPER_DOWNLOAD_VERSION}`;

const SAMPLE_ORDER: IncomingOrder = {
  id: "teste",
  customer_name: "Pedido de teste",
  table_label: "1",
  pickup_code: null,
  delivery_address: null,
  status: "received",
  order_type: "dine_in",
  payment_status: "pending",
  payment_method: null,
  notes: null,
  subtotal: 10,
  discount_amount: 0,
  service_charge_amount: 0,
  total: 10,
  created_at: new Date().toISOString(),
  status_changed_at: new Date().toISOString(),
  items: [
    {
      id: "teste-item",
      product_name: "Impressão de teste",
      quantity: 1,
      unit_price: 10,
      half_flavor_name: null,
      notes: null,
      addons: [],
      combo_choices: [],
      removed_ingredients: [],
    },
  ],
};

export function ConfiguracaoImpressao() {
  const [autoPrint, setAutoPrint] = useState(getAutoPrintEnabled());
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(getStoredPaperWidth());

  function handleAutoPrintToggle(enabled: boolean) {
    setAutoPrint(enabled);
    setAutoPrintEnabled(enabled);
  }

  function handlePaperWidthChange(width: PaperWidth) {
    setPaperWidth(width);
    setStoredPaperWidth(width);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Impressão</h2>
        <p className="text-sm text-muted-foreground">
          Comanda sai sozinha, sem precisar confirmar nada, quando roda dentro do app Sigma Impressão (abaixo).
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">Impressão automática</h3>
            <p className="text-xs text-muted-foreground">Imprime a comanda sozinha assim que o pedido chega.</p>
          </div>
          <button
            onClick={() => handleAutoPrintToggle(!autoPrint)}
            role="switch"
            aria-checked={autoPrint}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${autoPrint ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform ${
                autoPrint ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-bold">Tamanho da bobina</h3>
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {PAPER_WIDTH_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handlePaperWidthChange(value)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                paperWidth === value ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-bold">App Sigma Impressão</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Baixe, extraia o .zip numa pasta e abra o <code>sigma-print-app.exe</code> no computador ligado na
          impressora — sem senha, sem escolher impressora na tela. Ele usa a impressora que estiver definida como{" "}
          <strong>padrão no Windows</strong>. Deixe aberto o dia todo (ele já abre sozinho com o Windows se você
          colocar um atalho na pasta de inicialização). Precisa do{" "}
          <a
            href="https://dotnet.microsoft.com/download/dotnet/8.0/runtime?cid=getdotnetcore&os=windows&arch=x64"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            .NET 8 Desktop Runtime
          </a>{" "}
          — se não tiver instalado, o próprio Windows mostra um aviso oficial da Microsoft com o link certo na
          primeira tentativa de abrir.
        </p>
        <a
          href={WRAPPER_DOWNLOAD_URL}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:brightness-105"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Baixar Sigma Impressão (.zip)
        </a>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <Printer className="h-4 w-4" aria-hidden /> Testar impressão
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Fora do app Sigma Impressão isso abre o diálogo normal do navegador — é esperado, serve só pra conferir o
          layout.
        </p>
        <button
          onClick={() => printTicket(SAMPLE_ORDER)}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-105"
        >
          Imprimir teste
        </button>
      </div>
    </div>
  );
}
