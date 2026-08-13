-- Marca (logo/cor) por restaurante, separado de restaurants: restaurants é o
-- registro de conta controlado pela agência (só admin edita); marca é decisão
-- do próprio dono do restaurante, então precisa de RLS diferente. Sem linha
-- aqui = usa o padrão visual atual do app.
create table restaurant_branding (
  restaurant_id uuid primary key references restaurants (id) on delete cascade,
  logo_url text,
  primary_color text,
  updated_at timestamptz not null default now()
);

alter table restaurant_branding enable row level security;

-- Pública pra leitura — o storefront do cliente precisa aplicar a marca sem
-- estar logado, igual products/categories.
create policy restaurant_branding_select on restaurant_branding for select
  to anon, authenticated
  using (true);

create policy restaurant_branding_all on restaurant_branding for all
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id())
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());
