-- Cobrança do restaurante via Cakto (plano único, R$350/mês, assinatura
-- recorrente) — ver CLAUDE.md, seção "Cobrança (Cakto)". Produto/oferta já
-- existem do lado da Cakto (criados manualmente no painel deles antes desta
-- migration: produto "cadapio sig", oferta padrão id "3edmmmm", tipo
-- subscription, R$350, recorrência de 30 dias, sem limite de ciclos) — aqui
-- só rastreamos o status de pagamento de cada restaurante contra essa oferta
-- única e compartilhada. Não confundir com restaurants.status
-- (account_status: onboarding/active/suspended/cancelled), que continua
-- sendo o campo que o admin usa/vê — o webhook da Cakto atualiza os dois
-- juntos (ver função cakto-webhook).
create table public.restaurant_billing (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  cakto_order_id text,
  cakto_subscription_id text,
  -- unpaid: nunca pagou. active: assinatura em dia. past_due: cobrança
  -- falhou (Cakto ainda vai tentar de novo, ver retry_interval da oferta).
  -- canceled: assinatura cancelada (pelo cliente ou por esgotar as
  -- tentativas de cobrança).
  status text not null default 'unpaid' check (status in ('unpaid', 'active', 'past_due', 'canceled')),
  last_event text,
  last_event_at timestamptz,
  paid_at timestamptz,
  next_payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_billing enable row level security;

-- Só leitura pra staff/admin — toda escrita passa por service role dentro
-- das Edge Functions (cakto-create-checkout/cakto-webhook), nunca direto do
-- cliente, mesmo padrão de admin_action_log.
create policy restaurant_billing_select_staff on public.restaurant_billing
  for select to authenticated
  using (restaurant_id = current_restaurant_id());

create policy restaurant_billing_select_admin on public.restaurant_billing
  for select to authenticated
  using (current_app_role() = 'admin');
