-- Combo de composição fixa: o combo é um produto normal (preço próprio, já
-- validado no servidor igual qualquer produto) — combo_items é só o "o que
-- tem dentro", pro gestor montar e pro cliente ver antes de comprar.
create table combo_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  component_product_id uuid not null references products (id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  check (product_id != component_product_id)
);

create index combo_items_product_id_idx on combo_items (product_id);
create index combo_items_component_product_id_idx on combo_items (component_product_id);

alter table combo_items enable row level security;

-- Pública pra leitura — o cliente precisa ver o que vem no combo antes de comprar.
create policy combo_items_select on combo_items for select
  to anon, authenticated
  using (true);

create policy combo_items_insert on combo_items for insert
  to authenticated
  with check (
    exists (
      select 1 from products p
      where p.id = combo_items.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );

create policy combo_items_update on combo_items for update
  to authenticated
  using (
    exists (
      select 1 from products p
      where p.id = combo_items.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  )
  with check (
    exists (
      select 1 from products p
      where p.id = combo_items.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );

create policy combo_items_delete on combo_items for delete
  to authenticated
  using (
    exists (
      select 1 from products p
      where p.id = combo_items.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );
