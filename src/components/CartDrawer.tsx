import { Minus, Plus, X } from "lucide-react";
import type { CartItem } from "../lib/CartContext";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CartDrawer({
  open,
  items,
  subtotal,
  submitting,
  error,
  onClose,
  onIncrement,
  onDecrement,
  onConfirm,
}: {
  open: boolean;
  items: CartItem[];
  subtotal: number;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar carrinho"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex h-full w-full max-w-md flex-col bg-background shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">Seu pedido</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="press rounded-full p-2 hover:bg-muted">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">Seu carrinho está vazio.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => {
                const addonsPerUnit = item.addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0);
                return (
                  <li key={item.lineId} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{item.name}</div>
                      {item.comboChoices && item.comboChoices.length > 0 && (
                        <ul className="mt-0.5">
                          {item.comboChoices.map((choice) => (
                            <li key={choice.groupId} className="text-xs text-muted-foreground">
                              {choice.groupName}: {choice.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.addons.length > 0 && (
                        <ul className="mt-0.5">
                          {item.addons.map((addon) => (
                            <li key={addon.addonId} className="text-xs text-muted-foreground">
                              + {addon.quantity}x {addon.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">{currency(item.price + addonsPerUnit)}</div>
                    </div>
                    <div className="press flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-1 py-1">
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() => onDecrement(item.lineId)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-white text-primary shadow-xs"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <span className="min-w-[1ch] text-center text-sm font-bold">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Aumentar quantidade"
                        onClick={() => onIncrement(item.lineId)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-base font-bold">{currency(subtotal)}</span>
          </div>
          <button
            type="button"
            disabled={items.length === 0 || submitting}
            onClick={onConfirm}
            className="press w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Confirmar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
