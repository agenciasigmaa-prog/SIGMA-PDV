import { useParams } from "react-router-dom";
import { TableProvider, useTableContext } from "../lib/TableContext";
import { CartProvider } from "../lib/CartContext";
import { MesaCardapio } from "./MesaCardapio";

function MesaWithCart() {
  const { restaurantId } = useTableContext();
  return (
    <CartProvider restaurantId={restaurantId}>
      <MesaCardapio />
    </CartProvider>
  );
}

export function Mesa() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  if (!restaurantId) return null;
  return (
    <TableProvider restaurantId={restaurantId}>
      <MesaWithCart />
    </TableProvider>
  );
}
