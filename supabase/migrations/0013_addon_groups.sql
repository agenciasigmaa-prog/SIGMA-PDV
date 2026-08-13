-- Adicionais (extras) escopados por categoria — não globais, não por produto.
-- Um grupo criado numa categoria vale automaticamente pra todo produto dela,
-- sem tabela de ligação produto<->grupo: a regra é só addon_groups.category_id
-- = products.category_id.
create table addon_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);

create table addons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references addon_groups (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0
);

-- Snapshot do que foi pedido de verdade — mesmo motivo de order_items.unit_price
-- já ser snapshot: o adicional pode mudar de preço ou ser apagado depois, o
-- pedido antigo não pode mudar retroativamente.
create table order_item_addons (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items (id) on delete cascade,
  addon_id uuid references addons (id) on delete set null,
  name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null
);

create index addon_groups_category_id_idx on addon_groups (category_id);
create index addons_group_id_idx on addons (group_id);
create index order_item_addons_order_item_id_idx on order_item_addons (order_item_id);

alter table addon_groups enable row level security;
alter table addons enable row level security;
alter table order_item_addons enable row level security;

-- Público pra leitura, igual products/categories — o cardápio do cliente
-- precisa mostrar os adicionais disponíveis sem estar logado.
create policy addon_groups_select on addon_groups for select
  to anon, authenticated
  using (true);

create policy addon_groups_insert on addon_groups for insert
  to authenticated
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());
create policy addon_groups_update on addon_groups for update
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id())
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());
create policy addon_groups_delete on addon_groups for delete
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

create policy addons_select on addons for select
  to anon, authenticated
  using (true);

create policy addons_insert on addons for insert
  to authenticated
  with check (
    exists (
      select 1 from addon_groups g
      where g.id = addons.group_id
        and (current_app_role() = 'admin' or g.restaurant_id = current_restaurant_id())
    )
  );
create policy addons_update on addons for update
  to authenticated
  using (
    exists (
      select 1 from addon_groups g
      where g.id = addons.group_id
        and (current_app_role() = 'admin' or g.restaurant_id = current_restaurant_id())
    )
  )
  with check (
    exists (
      select 1 from addon_groups g
      where g.id = addons.group_id
        and (current_app_role() = 'admin' or g.restaurant_id = current_restaurant_id())
    )
  );
create policy addons_delete on addons for delete
  to authenticated
  using (
    exists (
      select 1 from addon_groups g
      where g.id = addons.group_id
        and (current_app_role() = 'admin' or g.restaurant_id = current_restaurant_id())
    )
  );

-- order_item_addons segue a visibilidade do order_items pai (mesmo padrão de
-- order_items_select: cliente dono do pedido, admin, ou staff/admin do tenant).
create policy order_item_addons_select on order_item_addons for select
  to authenticated
  using (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and (o.customer_id = (select auth.uid()) or current_app_role() = 'admin' or o.restaurant_id = current_restaurant_id())
    )
  );

create policy order_item_addons_insert on order_item_addons for insert
  to authenticated
  with check (
    exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_addons.order_item_id
        and o.customer_id = (select auth.uid())
    )
  );
