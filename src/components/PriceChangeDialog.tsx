import type { CartPriceCheckResult } from "../lib/cartPriceCheck";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PriceChangeDialog({
  result,
  onCancel,
  onAccept,
}: {
  result: CartPriceCheckResult;
  onCancel: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6">
      <div className="surface-card w-full max-w-sm p-6">
        <h2 className="text-lg font-bold">Seu carrinho mudou</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O restaurante atualizou o cardápio desde que você montou seu pedido.
        </p>

        {result.changes.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm">
            {result.changes.map((change) => (
              <li key={change.lineId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{change.name}</span>
                <span className="shrink-0">
                  <span className="text-muted-foreground line-through">{currency(change.oldPrice)}</span>{" "}
                  <span className="font-semibold">{currency(change.newPrice)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {result.removed.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
            {result.removed.map((item) => (
              <li key={item.lineId}>{item.name} não está mais disponível e será removido do carrinho.</li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="press flex-1 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted"
          >
            Rever carrinho
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="press flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
