-- Pagamento misto por parte: uma order_payment_splits pode ser paga com 2+
-- formas diferentes (ex: metade dinheiro, metade PIX). Cada linha aqui é uma
-- forma de pagamento aplicada a uma parte.
create table order_payment_split_payments (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references order_payment_splits (id) on delete cascade,

  -- Denormalizado (mesmo padrão de order_payment_splits em
  -- 0041_order_payment_splits.sql): RLS idiomática do projeto. Não precisa de
  -- canal realtime próprio — o UPDATE em order_payment_splits sempre acontece
  -- no mesmo request que grava pagamentos, então o canal que já existe em
  -- cima de order_payment_splits já dispara o reload que traz isso embutido.
  restaurant_id uuid not null references restaurants (id) on delete cascade,

  method payment_method not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index order_payment_split_payments_split_idx on order_payment_split_payments (split_id);

alter table order_payment_split_payments enable row level security;

-- Igual order_payment_splits: só SELECT direto pro staff, toda escrita via
-- Edge Function (staff-split-payment, com service_role).
create policy order_payment_split_payments_staff_select on order_payment_split_payments
  for select to authenticated
  using (restaurant_id = current_restaurant_id() or current_app_role() = 'admin');
