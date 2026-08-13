-- Hardening a partir dos advisors do Supabase: restringe RPC público das
-- funções internas, remove policies permissivas duplicadas, evita reavaliação
-- de auth.uid() por linha, e adiciona índices de FK faltantes.

revoke execute on function current_app_role() from public;
revoke execute on function current_restaurant_id() from public;
revoke execute on function handle_new_user() from public;
revoke execute on function prevent_role_escalation() from public;
grant execute on function current_app_role() to authenticated;
grant execute on function current_restaurant_id() to authenticated;

create index on admin_action_log (admin_id);
create index on order_items (product_id);
create index on orders (table_session_id);
create index on products (category_id);
create index on table_sessions (table_id);

drop policy profiles_select on profiles;
create policy profiles_select on profiles for select
  to authenticated
  using ((select auth.uid()) = id or current_app_role() = 'admin');

drop policy profiles_update on profiles;
create policy profiles_update on profiles for update
  to authenticated
  using ((select auth.uid()) = id or current_app_role() = 'admin')
  with check ((select auth.uid()) = id or current_app_role() = 'admin');

drop policy orders_select on orders;
create policy orders_select on orders for select
  to authenticated
  using (customer_id = (select auth.uid()) or current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

drop policy orders_insert on orders;
create policy orders_insert on orders for insert
  to authenticated
  with check (customer_id = (select auth.uid()));

drop policy order_items_select on order_items;
create policy order_items_select on order_items for select
  to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and (o.customer_id = (select auth.uid()) or current_app_role() = 'admin' or o.restaurant_id = current_restaurant_id())
  ));

drop policy order_items_insert on order_items;
create policy order_items_insert on order_items for insert
  to authenticated
  with check (exists (select 1 from orders o where o.id = order_items.order_id and o.customer_id = (select auth.uid())));

-- restaurants/categories/products/tables: separa insert/update/delete da leitura,
-- que já tem policy própria — evita 2 policies permissivas competindo no SELECT
drop policy restaurants_admin_write on restaurants;
create policy restaurants_insert on restaurants for insert to authenticated
  with check (current_app_role() = 'admin');
create policy restaurants_update on restaurants for update to authenticated
  using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
create policy restaurants_delete on restaurants for delete to authenticated
  using (current_app_role() = 'admin');

drop policy categories_write on categories;
create policy categories_insert on categories for insert to authenticated
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
create policy categories_update on categories for update to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()))
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
create policy categories_delete on categories for delete to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));

drop policy products_write on products;
create policy products_insert on products for insert to authenticated
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
create policy products_update on products for update to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()))
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
create policy products_delete on products for delete to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));

drop policy tables_write on tables;
create policy tables_insert on tables for insert to authenticated
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
create policy tables_update on tables for update to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()))
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
create policy tables_delete on tables for delete to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));
