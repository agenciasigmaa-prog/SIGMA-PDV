import { useParams } from "react-router-dom";
import { TableProvider, useTableContext } from "../lib/TableContext";
import { CartProvider } from "../lib/CartContext";
import { OrderChannelGate } from "../lib/OrderChannelContext";
import { MesaCardapio } from "./MesaCardapio";

function MesaWithCart() {
  const { restaurantId, restaurantName, logoUrl } = useTableContext();
  return (
    <CartProvider restaurantId={restaurantId}>
      <OrderChannelGate restaurantId={restaurantId} restaurantName={restaurantName} logoUrl={logoUrl}>
        <MesaCardapio />
      </OrderChannelGate>
    </CartProvider>
  );
}

// slug vem do subdomínio (App.tsx, resolvido pelo hostname); sem ele, cai no
// /loja/:restaurantId de sempre.
export function Mesa({ slug }: { slug?: string } = {}) {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  if (!slug && !restaurantId) return null;
  return (
    <TableProvider restaurantId={slug ? undefined : restaurantId} slug={slug}>
      <MesaWithCart />
    </TableProvider>
  );
}
