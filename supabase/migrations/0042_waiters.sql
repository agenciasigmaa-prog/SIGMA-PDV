-- Cadastro simples de garçons — sem senha, sem login individual. É só uma
-- lista de nomes reutilizável, escolhida localmente (localStorage) por quem
-- está no dispositivo, não uma identidade autenticada.
create table waiters (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index waiters_restaurant_idx on waiters (restaurant_id);

alter table waiters enable row level security;

-- Igual ao padrão de `ingredients` (0009_product_ingredients.sql): CRUD
-- direto do client, sem Edge Function — não envolve preço nem agregação.
create policy waiters_all on waiters for all to authenticated
  using (
    current_app_role() = 'admin'
    or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id())
  )
  with check (
    current_app_role() = 'admin'
    or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id())
  );

alter publication supabase_realtime add table waiters;
