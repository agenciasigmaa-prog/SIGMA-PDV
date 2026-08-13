-- Meio a meio: por categoria, permite montar produto com dois sabores (dois
-- produtos da mesma categoria) e escolher como cobrar quando os preços
-- diferem. half_flavor_name em order_items é snapshot (mesmo padrão de
-- order_item_addons.name) pra manter o histórico legível mesmo se o produto
-- do segundo sabor for excluído depois.

alter table categories
  add column allow_half_and_half boolean not null default false,
  add column half_and_half_pricing text not null default 'higher_price'
    check (half_and_half_pricing in ('higher_price', 'average'));

alter table order_items
  add column half_flavor_product_id uuid references products(id) on delete set null,
  add column half_flavor_name text;
