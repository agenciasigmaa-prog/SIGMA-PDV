/**
 * Cliente do agente de impressão local (agente/, binário Go rodando em
 * 127.0.0.1:18080 na máquina do restaurante). Ver agente/README.md pra API
 * completa.
 *
 * Nunca lança pra cima sem contexto: toda função aqui devolve um erro com
 * mensagem em português já pronta pra mostrar na tela, via
 * describeAgentError().
 */

import { buildOrderDocument, buildTeste, type EscPosCommand } from "./escposDoc";
import type { IncomingOrder } from "./orders";

const AGENT_BASE = "http://127.0.0.1:18080";

// Timeout curto pra detecção (health/printers/config): se o agente não
// responder rápido, é porque não está rodando — não vale a pena esperar os
// 60s de timeout de impressão pra isso.
const PROBE_TIMEOUT_MS = 1500;

export type AgentHealth = { ok: true; version: string; agentId: string };
export type AgentPrinter = { name: string; isDefault: boolean };
export type AgentConfig = { printerName: string; paperWidth: 58 | 80; copies: number; autoPrint: boolean };

export type AgentErrorKind = "offline" | "origin" | "not_found" | "timeout" | "queue_full" | "unsupported" | "unknown";

export class AgentError extends Error {
  kind: AgentErrorKind;

  constructor(message: string, kind: AgentErrorKind) {
    super(message);
    this.name = "AgentError";
    this.kind = kind;
  }
}

async function agentFetch(path: string, init?: RequestInit, timeoutMs = 10000): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${AGENT_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Rede falhou (agente não está rodando) ou o Chrome bloqueou por Local
    // Network Access — do ponto de vista do front, os dois são "offline".
    throw new AgentError(
      "Impressora PDV-Sigma não encontrada. Confira se o ImpressoraPDVSigma.exe está rodando nesta máquina.",
      "offline",
    );
  }

  if (response.status === 403) {
    throw new AgentError("Este site não está autorizado a imprimir por este agente (origem não permitida).", "origin");
  }

  return response;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Erro do agente (HTTP ${response.status})`;
  } catch {
    return `Erro do agente (HTTP ${response.status})`;
  }
}

/** Detecta se o agente está rodando. Nunca lança — devolve null se não achar. */
export async function probeAgent(): Promise<AgentHealth | null> {
  try {
    const response = await agentFetch("/health", { method: "GET" }, PROBE_TIMEOUT_MS);
    if (!response.ok) return null;
    return (await response.json()) as AgentHealth;
  } catch {
    return null;
  }
}

export async function listPrinters(): Promise<AgentPrinter[]> {
  const response = await agentFetch("/printers", { method: "GET" }, PROBE_TIMEOUT_MS);
  if (!response.ok) throw new AgentError(await parseError(response), "unknown");
  const body = (await response.json()) as { printers: AgentPrinter[] };
  return body.printers;
}

export async function getAgentConfig(): Promise<AgentConfig> {
  const response = await agentFetch("/config", { method: "GET" }, PROBE_TIMEOUT_MS);
  if (!response.ok) throw new AgentError(await parseError(response), "unknown");
  return (await response.json()) as AgentConfig;
}

export async function saveAgentConfig(config: AgentConfig): Promise<AgentConfig> {
  const response = await agentFetch("/config", { method: "PUT", body: JSON.stringify(config) }, PROBE_TIMEOUT_MS);
  if (!response.ok) throw new AgentError(await parseError(response), "unknown");
  return (await response.json()) as AgentConfig;
}

// Um /print por impressora — o agente já aceita um `printerName` por request
// (sobrepõe o padrão configurado nele), então imprimir na MESMA comanda em
// 2+ impressoras é só chamar isso mais de uma vez, sem precisar mudar nada
// no agente (Go) nem redistribuir o .exe.
async function printOnePrinter(commands: EscPosCommand[], printerName?: string): Promise<{ ok: true; jobId: string }> {
  // Timeout generoso (65s): o agente já aplica 60s de timeout de segurança
  // internamente (impressora offline etc.); o front só precisa esperar um
  // pouco mais que isso pra não cortar a resposta antes da hora.
  const response = await agentFetch(
    "/print",
    { method: "POST", body: JSON.stringify({ formato: "escpos", commands, ...(printerName ? { printerName } : {}) }) },
    65000,
  );

  if (response.ok) return (await response.json()) as { ok: true; jobId: string };

  const message = await parseError(response);
  if (response.status === 404) throw new AgentError(message, "not_found");
  if (response.status === 503) throw new AgentError(message, "queue_full");
  if (response.status === 504) throw new AgentError(message, "timeout");
  if (response.status === 501) throw new AgentError(message, "unsupported");
  throw new AgentError(message, "unknown");
}

// Dispara em paralelo: impressora principal (undefined = usa a configurada
// no agente) + cada impressora extra. Só lança erro se TODAS falharem —
// senão uma impressora sem papel derrubaria a comanda inteira, mesmo que as
// outras tivessem imprimido normalmente.
async function printCommands(commands: EscPosCommand[], extraPrinterNames: string[] = []): Promise<void> {
  const targets: (string | undefined)[] = [undefined, ...extraPrinterNames];
  const results = await Promise.allSettled(targets.map((printerName) => printOnePrinter(commands, printerName)));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length === results.length) throw failures[0].reason;
}

/** Imprime a comanda certa pro pedido (cozinha ou entrega, pelo canal), na
 * impressora principal e em quaisquer impressoras extras configuradas. */
export function printOrder(order: IncomingOrder, restaurantName: string, extraPrinterNames?: string[]) {
  return printCommands(buildOrderDocument(order, restaurantName), extraPrinterNames);
}

/** Página de teste — usada no primeiro clique da tela /impressora, que é o
 * gesto de usuário necessário pro prompt de Local Network Access do Chrome
 * (ver agente/README.md). */
export function printTeste(restaurantName: string, printerName: string, paperWidth: number, extraPrinterNames?: string[]) {
  return printCommands(buildTeste(restaurantName, printerName, paperWidth), extraPrinterNames);
}

function extraPrintersStorageKey(restaurantId: string) {
  return `sigma-extra-printers-${restaurantId}`;
}

/** Impressoras adicionais (além da principal, configurada no agente) que
 * recebem a mesma comanda ao mesmo tempo — preferência local, por
 * máquina/navegador (mesmo raciocínio de useSelectedWaiter), já que quem
 * está configurado aqui é o computador ligado nas impressoras físicas. */
export function getExtraPrinterNames(restaurantId: string | null): string[] {
  if (!restaurantId) return [];
  try {
    const raw = window.localStorage.getItem(extraPrintersStorageKey(restaurantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

export function setExtraPrinterNames(restaurantId: string, names: string[]) {
  window.localStorage.setItem(extraPrintersStorageKey(restaurantId), JSON.stringify(names));
}

/** Mensagem amigável em português pra qualquer erro vindo daqui. */
export function describeAgentError(error: unknown): string {
  if (error instanceof AgentError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erro desconhecido ao falar com o agente de impressão.";
}
