import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Printer, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import {
  describeAgentError,
  getAgentConfig,
  listPrinters,
  printTeste,
  probeAgent,
  saveAgentConfig,
  type AgentConfig,
  type AgentHealth,
  type AgentPrinter,
} from "../lib/printAgent";

const PAPER_WIDTH_OPTIONS: { value: 58 | 80; label: string }[] = [
  { value: 58, label: "58 mm" },
  { value: 80, label: "80 mm" },
];

// Servido como arquivo estático pelo próprio app restaurante (Vite copia
// tudo que está em public/ pro build sem processar) — ver
// agente/README.md, seção "Publicar uma versão nova", pra como atualizar
// esse arquivo depois de recompilar o agente.
const AGENT_DOWNLOAD_URL = "/downloads/ImpressoraPDVSigma.exe";

export function ConfiguracaoImpressao() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const [restaurantName, setRestaurantName] = useState("Restaurante");

  const [checking, setChecking] = useState(true);
  const [agent, setAgent] = useState<AgentHealth | null>(null);
  const [printers, setPrinters] = useState<AgentPrinter[]>([]);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        if (data?.name) setRestaurantName(data.name);
      });
  }, [restaurantId]);

  // Tenta detectar sozinha ao abrir a tela. Em dev (localhost → 127.0.0.1)
  // isso funciona sem prompt algum. Em produção, se o Chrome exigir o gesto
  // de Local Network Access, esta chamada silenciosa simplesmente falha e a
  // tela cai no estado "não detectado" — o clique em "Tentar novamente" (ou
  // em "Imprimir página de teste") é o gesto que destrava o prompt.
  useEffect(() => {
    checkAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAgent() {
    setChecking(true);
    setError(null);
    const health = await probeAgent();
    setAgent(health);
    if (health) {
      try {
        const [printerList, cfg] = await Promise.all([listPrinters(), getAgentConfig()]);
        setPrinters(printerList);
        setConfig(cfg);
      } catch (err) {
        setError(describeAgentError(err));
      }
    }
    setChecking(false);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await saveAgentConfig(config);
      setConfig(updated);
      setSaved(true);
    } catch (err) {
      setError(describeAgentError(err));
    } finally {
      setSaving(false);
    }
  }

  // Botão de teste é sempre visível (mesmo sem agente detectado ainda) —
  // clicar nele é o gesto de usuário que dispara (e, ao conceder, resolve) o
  // prompt de Local Network Access do Chrome. Ver agente/README.md.
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      // Se o agente ainda não tinha sido detectado, este clique é a chance
      // de detectar de verdade (com gesto de usuário garantido).
      if (!agent) await checkAgent();
      const printerName = config?.printerName || printers[0]?.name || "";
      const paperWidth = config?.paperWidth ?? 80;
      await printTeste(restaurantName, printerName || "(padrão do sistema)", paperWidth);
      setTestResult("ok");
      // Depois de um teste bem-sucedido, reflete que o agente está de pé.
      if (!agent) await checkAgent();
    } catch (err) {
      setTestResult(describeAgentError(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold">Impressora</h2>
        <p className="text-sm text-muted-foreground">
          Impressão silenciosa de comandas, via o agente instalado neste computador.
        </p>
      </div>

      {checking && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procurando o agente…
        </div>
      )}

      {!checking && !agent && (
        <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-sm font-bold text-amber-900">Impressora PDV-Sigma não encontrada nesta máquina</p>
          </div>

          <a
            href={AGENT_DOWNLOAD_URL}
            download
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-primary-foreground shadow-card hover:brightness-105"
          >
            <Download className="h-5 w-5" aria-hidden /> Baixar ImpressoraPDVSigma.exe
          </a>

          <ol className="list-decimal space-y-0.5 pl-4 text-sm text-amber-800">
            <li>Baixe o instalador pelo botão acima.</li>
            <li>Copie o arquivo para uma pasta fixa, ex. <code>C:\ImpressoraPDVSigma\</code>.</li>
            <li>Dê dois cliques para rodar o <code>ImpressoraPDVSigma.exe</code> uma vez.</li>
            <li>
              Um ícone aparece na bandeja do Windows e o início automático já é ligado sozinho na primeira vez (dá
              pra conferir/desligar clicando com o botão direito no ícone).
            </li>
            <li>Clique em "Imprimir página de teste" abaixo.</li>
          </ol>

          <button
            onClick={checkAgent}
            className="flex items-center gap-1.5 rounded-full border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
          </button>
        </div>
      )}

      {!checking && agent && config && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Impressora PDV-Sigma conectada — versão {agent.version}
            </p>
            <a
              href={AGENT_DOWNLOAD_URL}
              download
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3 w-3" aria-hidden /> Baixar versão mais recente
            </a>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Impressora</label>
            <select
              value={config.printerName}
              onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isDefault ? "(padrão do sistema)" : ""}
                </option>
              ))}
            </select>
            {printers.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhuma impressora encontrada — confira se ela está instalada no Windows.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Largura do papel</label>
            <div className="flex gap-2">
              {PAPER_WIDTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setConfig({ ...config, paperWidth: opt.value })}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                    config.paperWidth === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Cópias por comanda</label>
            <input
              type="number"
              min={1}
              max={5}
              value={config.copies}
              onChange={(e) => setConfig({ ...config, copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
              className="w-24 rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={config.autoPrint}
              onChange={(e) => setConfig({ ...config, autoPrint: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Imprimir automaticamente ao chegar um pedido novo
          </label>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-60"
            >
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
              Imprimir página de teste
            </button>
          </div>
        </div>
      )}

      {!checking && !agent && (
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105 disabled:opacity-60"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
          Imprimir página de teste
        </button>
      )}

      {testResult === "ok" && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Página de teste enviada — confira o papel.
        </p>
      )}
      {testResult && testResult !== "ok" && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {testResult}
        </p>
      )}
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
