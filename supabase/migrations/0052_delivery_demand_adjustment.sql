-- Ajuste temporário de tempo/taxa de entrega ("alta demanda", motoboy
-- faltou, chuva etc.), inspirado no "Gestor de Pedidos" do iFood. Uma linha
-- só por restaurante basta (só existe um ajuste ativo por vez) — por isso
-- vive em restaurant_branding (PK restaurant_id) em vez de tabela nova.
-- Fica em restaurant_branding, não em restaurants, pelo mesmo motivo do
-- meta_pixel_id (0051_marketing_pixel): a RLS de UPDATE em restaurants é
-- admin-only, restaurant_branding já deixa o próprio staff escrever na
-- própria linha.
--
-- demand_expires_at nulo (ou no passado) = sem ajuste ativo. Expira sozinho
-- — não tem job nem trigger apagando os outros campos, quem lê decide se
-- está ativo comparando com now() (client em demandAdjustment.ts, servidor
-- em place-dine-in-order).
alter table restaurant_branding
  add column demand_extra_minutes integer,
  add column demand_extra_fee numeric,
  add column demand_reason text,
  add column demand_reason_other text,
  add column demand_expires_at timestamptz;

alter table restaurant_branding
  add constraint restaurant_branding_demand_extra_minutes_check
    check (demand_extra_minutes is null or demand_extra_minutes >= 0),
  add constraint restaurant_branding_demand_extra_fee_check
    check (demand_extra_fee is null or demand_extra_fee >= 0),
  add constraint restaurant_branding_demand_reason_check
    check (demand_reason is null or demand_reason in ('motoboy_faltou', 'chuva', 'cozinheiro_faltou', 'alta_demanda', 'outro'));

comment on column restaurant_branding.demand_extra_minutes is 'Minutos extras de entrega durante um ajuste de alta demanda ativo (null = sem ajuste).';
comment on column restaurant_branding.demand_extra_fee is 'Taxa extra somada à taxa de entrega do bairro enquanto o ajuste está ativo — aplicada no servidor por place-dine-in-order, nunca confia no client.';
comment on column restaurant_branding.demand_reason is 'Motivo do ajuste: motoboy_faltou | chuva | cozinheiro_faltou | alta_demanda | outro.';
comment on column restaurant_branding.demand_reason_other is 'Texto livre quando demand_reason = outro.';
comment on column restaurant_branding.demand_expires_at is 'Quando o ajuste expira sozinho — null ou no passado = inativo.';
