-- Pedido lançado manualmente pelo staff (telefone/balcão) não tem cliente de
-- verdade por trás — customer_id vira opcional pra não vincular o pedido à
-- conta do funcionário que lançou (bug: place-dine-in-order usava o id de
-- quem chama a function, que pra pedido manual é o staff, não o cliente).
alter table orders alter column customer_id drop not null;
