import { ChevronRight } from "lucide-react";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Barra fixa embaixo da tela, sempre visível enquanto tem item no carrinho —
// o elemento mais "totem" da interface (mesma ideia da barra de resumo de
// pedido de um totem de fast-food físico). Fica por cima de qualquer tela
// (grade de categorias ou categoria aberta), pra nunca perder o pedido de
// vista ao navegar.
export function OrderBar({
  itemCount,
  subtotal,
  onClick,
}: {
  itemCount: number;
  subtotal: number;
  onClick: () => void;
}) {
  if (itemCount === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
      <button
        type="button"
        onClick={onClick}
        className="press mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-primary py-3.5 pl-5 pr-2 text-primary-foreground shadow-elevated md:max-w-lg"
      >
        <span className="text-sm font-semibold">
          {itemCount} {itemCount === 1 ? "item" : "itens"} · {currency(subtotal)}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-white/15 py-2 pl-3.5 pr-2.5 text-sm font-bold">
          Ver pedido <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    </div>
  );
}
