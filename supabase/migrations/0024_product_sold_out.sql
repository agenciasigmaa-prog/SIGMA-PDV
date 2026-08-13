-- Esgotado hoje: diferente de "active" (que some do cardápio de vez), um
-- produto esgotado continua visível pro cliente mas não pode ser pedido.
-- Toggle manual, sem reset automático por data.
alter table products add column sold_out boolean not null default false;
