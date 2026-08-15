import { orderLocationLabel, type IncomingOrder } from "../lib/orders";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Mesmo conteúdo que o antigo ticketFormat.ts montava em ESC/POS (nome,
// local/hora, endereço se entrega, observações, itens com adicionais/combo/
// ingredientes removidos, total) — só que como HTML/CSS impresso via
// window.print()/PrintAsync em vez de bytes crus. Acentuação em pt-BR fica
// por conta do próprio navegador (UTF-8), não precisa mais de code page.
export function TicketPrintView({ order }: { order: IncomingOrder }) {
  const time = new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="font-mono text-[11px] leading-snug text-black">
      <p className="text-center text-sm font-bold">{order.customer_name}</p>
      <p className="text-center">
        {orderLocationLabel(order)} - {time}
      </p>

      {order.order_type === "delivery" && order.delivery_address && (
        <p className="text-center font-bold">{order.delivery_address.text}</p>
      )}

      <hr className="my-1 border-black" />

      {order.notes && <p className="mb-1">Obs: {order.notes}</p>}

      {order.items.map((item) => (
        <div key={item.id} className="mb-1.5">
          <p className="font-bold">
            {item.quantity}x {item.product_name}
            {item.half_flavor_name && ` / ${item.half_flavor_name}`}
          </p>
          {item.notes && <p className="pl-2">Obs: {item.notes}</p>}
          {item.addons.map((addon, index) => (
            <p key={`addon-${index}`} className="pl-2">
              + {addon.quantity}x {addon.name}
            </p>
          ))}
          {item.combo_choices.map((choice, index) => (
            <p key={`choice-${index}`} className="pl-2">
              {choice.group_name}: {choice.option_name}
            </p>
          ))}
          {item.removed_ingredients.map((name, index) => (
            <p key={`removed-${index}`} className="pl-2">
              Sem {name}
            </p>
          ))}
        </div>
      ))}

      <hr className="my-1 border-black" />

      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>{currency(order.total)}</span>
      </div>
    </div>
  );
}
