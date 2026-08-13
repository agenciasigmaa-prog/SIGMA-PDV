-- Combo com escolha do cliente: grupo de opções dentro de um combo (ex:
-- "Escolha o hambúrguer"), convive com combo_items (itens fixos) no mesmo
-- produto. Sempre "escolha 1 por grupo" nesta versão.
create table combo_choice_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade, -- o combo
  name text not null,
  sort_order int not null default 0
);

create table combo_choice_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references combo_choice_groups(id) on delete cascade,
  option_product_id uuid not null references products(id) on delete cascade,
  sort_order int not null default 0
);

create index combo_choice_groups_product_id_idx on combo_choice_groups (product_id);
create index combo_choice_options_group_id_idx on combo_choice_options (group_id);
create index combo_choice_options_option_product_id_idx on combo_choice_options (option_product_id);

alter table combo_choice_groups enable row level security;
alter table combo_choice_options enable row level security;

create policy combo_choice_groups_select on combo_choice_groups
  for select to anon, authenticated using (true);
create policy combo_choice_groups_insert on combo_choice_groups
  for insert to authenticated with check (
    exists (select 1 from products p where p.id = combo_choice_groups.product_id
      and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id()))
  );
create policy combo_choice_groups_update on combo_choice_groups
  for update to authenticated using (
    exists (select 1 from products p where p.id = combo_choice_groups.product_id
      and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id()))
  );
create policy combo_choice_groups_delete on combo_choice_groups
  for delete to authenticated using (
    exists (select 1 from products p where p.id = combo_choice_groups.product_id
      and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id()))
  );

create policy combo_choice_options_select on combo_choice_options
  for select to anon, authenticated using (true);
create policy combo_choice_options_insert on combo_choice_options
  for insert to authenticated with check (
    exists (select 1 from combo_choice_groups g join products p on p.id = g.product_id
      where g.id = combo_choice_options.group_id
      and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id()))
  );
create policy combo_choice_options_update on combo_choice_options
  for update to authenticated using (
    exists (select 1 from combo_choice_groups g join products p on p.id = g.product_id
      where g.id = combo_choice_options.group_id
      and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id()))
  );
create policy combo_choice_options_delete on combo_choice_options
  for delete to authenticated using (
    exists (select 1 from combo_choice_groups g join products p on p.id = g.product_id
      where g.id = combo_choice_options.group_id
      and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id()))
  );
