import type { DeliveryDriver } from "../lib/deliveryDrivers";

// Atribuir/transferir motoboy de um pedido de entrega — mesmo padrão de
// WaiterAssignSelect (troca sempre reatribui incondicionalmente).
export function DeliveryDriverAssignSelect({
  drivers,
  driverId,
  onAssign,
}: {
  drivers: DeliveryDriver[];
  driverId: string | null;
  onAssign: (driverId: string) => void;
}) {
  return (
    <select
      value={driverId ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => e.target.value && onAssign(e.target.value)}
      className="shrink-0 rounded-lg border border-border bg-transparent px-2 py-1 text-[11px] font-bold text-muted-foreground"
    >
      <option value="" disabled>
        Sem motoboy
      </option>
      {drivers
        .filter((d) => d.active || d.id === driverId)
        .map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
    </select>
  );
}
