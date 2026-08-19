-- Tela de Configurações do restaurante: ligar/desligar o cardápio pro
-- cliente e cadastrar horário de funcionamento por dia da semana.
--
-- O dono não tem UPDATE direto em restaurants (restaurants_update é
-- admin-only, 0002_harden_rls.sql) — de propósito, pra ele não poder
-- mexer em campos que são da agência (ex. status da conta). Em vez de abrir
-- uma policy nova nessa tabela (que teria que ser ampla demais, já que RLS
-- não filtra por coluna), essas duas ações passam por uma Edge Function
-- (restaurant-settings) que só toca ordering_enabled/business_hours,
-- validado contra o restaurant_id do próprio staff logado.
alter table restaurants add column ordering_enabled boolean not null default true;

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = domingo
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  unique (restaurant_id, day_of_week)
);

alter table business_hours enable row level security;

-- Público porque o cardápio do cliente mostra o horário — mesmo racional de
-- restaurants_select_public/categories/products. Escrita só via Edge
-- Function (service role, bypassa RLS), por isso não tem policy de
-- insert/update/delete aqui.
create policy business_hours_select_public on business_hours for select
  to anon, authenticated
  using (true);
