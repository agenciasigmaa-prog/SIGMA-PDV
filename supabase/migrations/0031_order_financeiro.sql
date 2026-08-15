-- Financeiro básico: desconto e taxa de serviço aplicados pelo staff antes de
-- registrar o pagamento. total = subtotal - discount_amount + service_charge_amount.
alter table orders add column discount_amount numeric not null default 0;
alter table orders add column service_charge_amount numeric not null default 0;
