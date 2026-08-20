-- Vínculo cliente-restaurante por CADASTRO/LOGIN no cardápio, não só por
-- pedido. Antes, a aba Clientes (restaurante/) só mostrava quem já tinha um
-- pedido feito ali (profiles_select_restaurant_customers exigia EXISTS em
-- orders) — agora criar conta ou logar no cardápio de um restaurante já
-- registra o cliente ali, mesmo sem nenhum pedido ainda. O mesmo cliente
-- pode ficar vinculado a vários restaurantes (um vínculo por cardápio
-- visitado logado), sem duplicar a conta em profiles — profiles continua
-- global na plataforma.
create table public.restaurant_customer_links (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, customer_id)
);

alter table public.restaurant_customer_links enable row level security;

-- O próprio cliente registra a própria visita (upsert idempotente, disparado
-- pelo storefront assim que resolve o restaurante com uma sessão real
-- logada) — nunca em nome de outro customer_id.
create policy restaurant_customer_links_insert_self on public.restaurant_customer_links
  for insert to authenticated
  with check (customer_id = auth.uid());

-- Equipe do restaurante lê os vínculos do próprio restaurante — mesmo padrão
-- de current_restaurant_id() usado no resto do projeto.
create policy restaurant_customer_links_select_staff on public.restaurant_customer_links
  for select to authenticated
  using (restaurant_id = current_restaurant_id());

alter publication supabase_realtime add table public.restaurant_customer_links;

-- profiles_select_restaurant_customers ganha um segundo caminho: cliente
-- aparece pra equipe se já pediu ALI *ou* já se cadastrou/logou no cardápio
-- dali — antes só o pedido contava.
drop policy profiles_select_restaurant_customers on public.profiles;
create policy profiles_select_restaurant_customers on public.profiles
  for select to authenticated
  using (
    role = 'customer'
    and current_app_role() = any (array['restaurant_owner'::app_role, 'restaurant_staff'::app_role])
    and (
      exists (
        select 1 from public.orders o
        where o.customer_id = profiles.id and o.restaurant_id = current_restaurant_id()
      )
      or exists (
        select 1 from public.restaurant_customer_links l
        where l.customer_id = profiles.id and l.restaurant_id = current_restaurant_id()
      )
    )
  );
