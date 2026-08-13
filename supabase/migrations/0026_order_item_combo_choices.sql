-- Snapshot da escolha feita em cada grupo do combo no momento do pedido
-- (mesmo padrão de order_item_addons: nome guardado à parte, FK opcional
-- pra sobreviver a exclusão futura do produto escolhido).
create table order_item_combo_choices (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  group_name text not null,
  option_product_id uuid references products(id) on delete set null,
  option_name text not null
);

create index order_item_combo_choices_order_item_id_idx on order_item_combo_choices (order_item_id);
create index order_item_combo_choices_option_product_id_idx on order_item_combo_choices (option_product_id);

alter table order_item_combo_choices enable row level security;

create policy order_item_combo_choices_select on order_item_combo_choices
  for select to authenticated using (
    exists (
      select 1 from order_items oi join orders o on o.id = oi.order_id
      where oi.id = order_item_combo_choices.order_item_id
        and (o.customer_id = (select auth.uid()) or current_app_role() = 'admin' or o.restaurant_id = current_restaurant_id())
    )
  );
create policy order_item_combo_choices_insert on order_item_combo_choices
  for insert to authenticated with check (true);
