// Dois avisos sonoros diferentes pra dar pro balconista notar (sem olhar
// pra tela) se o pedido novo é de mesa/retirada ou de entrega. Gerado via
// Web Audio, sem depender de arquivo de áudio externo pra empacotar.
import type { OrderType } from "./orders";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(ctx: AudioContext, frequency: number, startTime: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.25, startTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

// Mesa/retirada: dois toques curtos e agudos, tipo campainha de balcão.
function playDineInChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.12);
  tone(ctx, 1175, now + 0.14, 0.16);
}

// Entrega: três toques mais graves e mais longos, pra diferenciar de ouvido
// sem precisar olhar o board (é o canal que mais atrasa se passar batido).
function playDeliveryChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  tone(ctx, 523, now, 0.14);
  tone(ctx, 523, now + 0.18, 0.14);
  tone(ctx, 659, now + 0.36, 0.22);
}

export function playOrderSound(orderType: OrderType) {
  const ctx = getContext();
  if (!ctx) return;
  if (orderType === "delivery") playDeliveryChime(ctx);
  else playDineInChime(ctx);
}
