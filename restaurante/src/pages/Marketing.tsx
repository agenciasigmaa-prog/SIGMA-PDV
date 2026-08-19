import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { useSession } from "../lib/useSession";
import { useMarketingSettings } from "../lib/marketing";
import { usePreviewLink } from "../lib/previewLink";

export function Marketing() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { pixelId, loading, savePixelId } = useMarketingSettings(restaurantId);
  const { url: baseUrl } = usePreviewLink(restaurantId);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">Marketing</h2>
      <PixelSection pixelId={pixelId} loading={loading} onSave={savePixelId} />
      <LinkSection baseUrl={baseUrl} />
    </div>
  );
}

function PixelSection({
  pixelId,
  loading,
  onSave,
}: {
  pixelId: string | null;
  loading: boolean;
  onSave: (value: string | null) => Promise<string | null>;
}) {
  const [value, setValue] = useState(pixelId ?? "");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loadedOnce && !loading) {
    setLoadedOnce(true);
    setValue(pixelId ?? "");
  }

  async function handleSave() {
    setError(null);
    setMessage(null);
    setSaving(true);
    const err = await onSave(value);
    setSaving(false);
    if (err) setError(err);
    else setMessage("Salvo.");
  }

  return (
    <section className="surface-card space-y-3 p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Pixel do Meta (Facebook/Instagram Ads)</h3>
      <p className="text-xs text-muted-foreground">
        Cole o ID do Pixel pra medir visitas ao cardápio e pedidos confirmados nos seus anúncios. Ativa assim que
        salvar — sem pixel configurado, o cardápio não carrega nada do Meta.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex.: 1234567890123456"
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="press shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

type LinkPurpose = "trafego" | "mesa";

// Link já abre o cardápio direto no canal certo (sem perguntar "mesa,
// retirada ou entrega?") — "canal"/"mesa" são lidos por
// src/lib/OrderChannelContext.tsx e src/pages/MesaCardapio.tsx no storefront.
function buildUrl(baseUrl: string, purpose: LinkPurpose, tableNumber: string): string {
  if (purpose === "trafego") return `${baseUrl}?canal=delivery`;
  const table = tableNumber.trim();
  return `${baseUrl}?canal=dine_in${table ? `&mesa=${encodeURIComponent(table)}` : ""}`;
}

function LinkSection({ baseUrl }: { baseUrl: string | null }) {
  const [purpose, setPurpose] = useState<LinkPurpose>("trafego");
  const [tableNumber, setTableNumber] = useState("");
  const [copied, setCopied] = useState(false);

  const generatedUrl = baseUrl ? buildUrl(baseUrl, purpose, tableNumber) : null;

  async function handleCopy() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="surface-card space-y-3 p-5">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Gerador de link</h3>
      <p className="text-xs text-muted-foreground">Escolha pra que vai usar o link.</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPurpose("trafego")}
          className={`press flex-1 rounded-full px-3 py-2 text-xs font-bold ${
            purpose === "trafego" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Tráfego pago (delivery)
        </button>
        <button
          type="button"
          onClick={() => setPurpose("mesa")}
          className={`press flex-1 rounded-full px-3 py-2 text-xs font-bold ${
            purpose === "mesa" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Mesa
        </button>
      </div>

      {purpose === "trafego" ? (
        <p className="text-xs text-muted-foreground">
          Pro anúncio de tráfego pago — o cliente cai direto no cardápio já no fluxo de delivery, sem a tela de
          "como você quer receber?".
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Pra colar num adesivo/QR code de uma mesa específica — abre direto no fluxo de "comer no local" e já
            preenche o número da mesa (o cliente ainda pode corrigir).
          </p>
          <input
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="Número da mesa (opcional)"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
        </>
      )}

      {generatedUrl ? (
        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{generatedUrl}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copiar link"
            className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10"
          >
            {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Carregando link…</p>
      )}
    </section>
  );
}
