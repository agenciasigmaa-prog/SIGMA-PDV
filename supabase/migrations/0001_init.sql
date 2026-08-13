-- Schema multi-tenant: ADM (agência) > Restaurante (tenant) > Cliente final

-- ── Enums ────────────────────────────────────────────────────────────────
create type account_status as enum ('onboarding', 'active', 'suspended', 'cancelled');
create type app_role as enum ('admin', 'restaurant_owner', 'restaurant_staff', 'customer');
create type order_type as enum ('dine_in', 'pickup', 'delivery');
create type order_status as enum ('received', 'preparing', 'ready', 'completed', 'cancelled');
create type payment_method as enum ('cash', 'card', 'pix');
create type payment_status as enum ('pending', 'paid');

-- ── Tabelas ──────────────────────────────────────────────────────────────

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status account_status not null default 'onboarding',
  contact_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  last_order_at timestamptz
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app_role not null default 'customer',
  restaurant_id uuid references restaurants (id) on delete set null,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  constraint staff_requires_restaurant check (
    (role in ('restaurant_owner', 'restaurant_staff')) = (restaurant_id is not null)
  )
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  image_url text,
  sort_order int not null default 0
);

create table products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  name text not null,
  description text,
  image_url text,
  price numeric(10, 2) not null,
  original_price numeric(10, 2),
  prep_minutes int,
  most_ordered boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  label text not null,
  qr_token uuid not null default gen_random_uuid() unique
);

create table table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references tables (id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  total_charged numeric(10, 2)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  customer_id uuid not null references auth.users (id),
  order_type order_type not null,
  status order_status not null default 'received',
  table_session_id uuid references table_sessions (id),
  pickup_code text,
  delivery_address jsonb,
  payment_method payment_method,
  payment_status payment_status not null default 'pending',
  change_for numeric(10, 2),
  subtotal numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid not null references products (id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null,
  notes text
);

create table admin_action_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id),
  target_restaurant_id uuid references restaurants (id),
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index on profiles (restaurant_id);
create index on categories (restaurant_id);
create index on products (restaurant_id);
create index on tables (restaurant_id);
create index on orders (restaurant_id);
create index on orders (customer_id);
create index on order_items (order_id);
create index on admin_action_log (target_restaurant_id);

-- ── Novo usuário do Supabase Auth vira profile 'customer' por padrão ───────
-- Role de staff/admin é atribuída manualmente depois, nunca por self-signup.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Helpers de RLS (security definer pra evitar recursão nas policies) ────
create function current_app_role() returns app_role
language sql security definer stable set search_path = public
as $$ select role from profiles where id = auth.uid() $$;

create function current_restaurant_id() returns uuid
language sql security definer stable set search_path = public
as $$ select restaurant_id from profiles where id = auth.uid() $$;

-- Impede que qualquer papel além de admin altere role/restaurant_id do próprio profile
create function prevent_role_escalation() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if current_app_role() is distinct from 'admin' then
    if new.role <> old.role or new.restaurant_id is distinct from old.restaurant_id then
      raise exception 'not authorized to change role or restaurant_id';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on profiles
  for each row execute function prevent_role_escalation();

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table restaurants enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table tables enable row level security;
alter table table_sessions enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table admin_action_log enable row level security;

-- restaurants: admin vê tudo, dono/staff vê só o próprio tenant
create policy restaurants_select on restaurants for select
  to authenticated
  using (current_app_role() = 'admin' or id = current_restaurant_id());
create policy restaurants_admin_write on restaurants for all
  to authenticated
  using (current_app_role() = 'admin') with check (current_app_role() = 'admin');

-- profiles: cada um vê/edita o próprio; admin vê/edita todos
create policy profiles_select on profiles for select
  to authenticated
  using (auth.uid() = id or current_app_role() = 'admin');
create policy profiles_update on profiles for update
  to authenticated
  using (auth.uid() = id or current_app_role() = 'admin')
  with check (auth.uid() = id or current_app_role() = 'admin');

-- categories/products/tables: leitura pública (cardápio), escrita por staff do tenant ou admin
create policy categories_select on categories for select
  to anon, authenticated
  using (true);
create policy categories_write on categories for all
  to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()))
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));

create policy products_select on products for select
  to anon, authenticated
  using (true);
create policy products_write on products for all
  to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()))
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));

create policy tables_select on tables for select
  to anon, authenticated
  using (true);
create policy tables_write on tables for all
  to authenticated
  using (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()))
  with check (current_app_role() = 'admin' or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id()));

-- table_sessions: staff/admin do tenant da mesa
create policy table_sessions_staff on table_sessions for all
  to authenticated
  using (
    current_app_role() = 'admin'
    or exists (select 1 from tables t where t.id = table_sessions.table_id and t.restaurant_id = current_restaurant_id())
  )
  with check (
    current_app_role() = 'admin'
    or exists (select 1 from tables t where t.id = table_sessions.table_id and t.restaurant_id = current_restaurant_id())
  );

-- orders: cliente vê/cria os próprios; staff/admin do tenant vê/atualiza
create policy orders_select on orders for select
  to authenticated
  using (customer_id = auth.uid() or current_app_role() = 'admin' or restaurant_id = current_restaurant_id());
create policy orders_insert on orders for insert
  to authenticated
  with check (customer_id = auth.uid());
create policy orders_staff_update on orders for update
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id())
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

-- order_items: segue a visibilidade do pedido pai
create policy order_items_select on order_items for select
  to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and (o.customer_id = auth.uid() or current_app_role() = 'admin' or o.restaurant_id = current_restaurant_id())
  ));
create policy order_items_insert on order_items for insert
  to authenticated
  with check (exists (select 1 from orders o where o.id = order_items.order_id and o.customer_id = auth.uid()));

-- admin_action_log: só admin
create policy admin_action_log_admin_only on admin_action_log for all
  to authenticated
  using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
