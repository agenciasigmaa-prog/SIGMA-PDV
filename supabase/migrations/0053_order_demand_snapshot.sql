-- Congela o ajuste de "alta demanda" (ver 0052_delivery_demand_adjustment.sql)
-- no próprio pedido, no momento em que ele é criado — mesmo raciocínio já
-- usado pra neighborhood_name/delivery_fee_amount: se o ajuste em
-- restaurant_branding expirar ou mudar depois, o pedido continua mostrando
-- exatamente o que valia quando foi feito. Usado por "Meu pedido"
-- (src/components/MyOrderSheet.tsx) pra avisar o cliente que a entrega
-- pode demorar mais por causa de alta demanda, mesmo depois do ajuste ter
-- expirado.
alter table orders
  add column demand_extra_minutes integer,
  add column demand_reason text;

alter table orders
  add constraint orders_demand_extra_minutes_check check (demand_extra_minutes is null or demand_extra_minutes >= 0),
  add constraint orders_demand_reason_check
    check (demand_reason is null or demand_reason in ('motoboy_faltou', 'chuva', 'cozinheiro_faltou', 'alta_demanda', 'outro'));

comment on column orders.demand_extra_minutes is 'Minutos extras de entrega congelados do ajuste de alta demanda ativo no momento do pedido (null = nenhum ajuste estava ativo).';
comment on column orders.demand_reason is 'Motivo do ajuste de alta demanda congelado no momento do pedido, mesmos valores de restaurant_branding.demand_reason.';
