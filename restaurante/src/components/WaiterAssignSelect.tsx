import type { Waiter } from "../lib/waiters";

// Atribuir/transferir garçom de um pedido — usado tanto em /pedidos quanto
// na aba Garçom, direto na lista (sem precisar abrir o detalhe). Troca de
// valor sempre reatribui incondicionalmente (transferência é uma ação
// deliberada, diferente do "Assumir" com compare-and-swap).
export function WaiterAssignSelect({
  waiters,
  waiterId,
  onAssign,
}: {
  waiters: Waiter[];
  waiterId: string | null;
  onAssign: (waiterId: string) => void;
}) {
  return (
    <select
      value={waiterId ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => e.target.value && onAssign(e.target.value)}
      className="shrink-0 rounded-lg border border-border bg-transparent px-2 py-1 text-[11px] font-bold text-muted-foreground"
    >
      <option value="" disabled>
        Sem garçom
      </option>
      {waiters
        .filter((w) => w.active || w.id === waiterId)
        .map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
    </select>
  );
}
