import { useParams } from "react-router-dom";
import { TableProvider, useTableContext } from "../lib/TableContext";
import { CartProvider } from "../lib/CartContext";
import { MesaCardapio } from "./MesaCardapio";

function MesaWithCart() {
  const { tableId } = useTableContext();
  return (
    <CartProvider tableId={tableId}>
      <MesaCardapio />
    </CartProvider>
  );
}

export function Mesa() {
  const { token } = useParams<{ token: string }>();
  if (!token) return null;
  return (
    <TableProvider token={token}>
      <MesaWithCart />
    </TableProvider>
  );
}
