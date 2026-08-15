-- Observação geral do pedido (ex: "cliente vai buscar depois"), digitada pelo
-- staff — order_items.notes já existe desde 0008 mas nunca foi exposto/usado.
alter table orders add column notes text;
