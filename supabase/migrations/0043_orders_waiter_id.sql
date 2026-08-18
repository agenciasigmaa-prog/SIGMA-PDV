-- Vínculo pedido -> garçom. Mutável direto do client pela policy
-- orders_staff_update já existente (mesmo raciocínio de payment_method/status
-- hoje: não recalcula preço, não há nenhuma outra policy no projeto
-- dependente de waiter_id) — não precisa de Edge Function.
alter table orders add column waiter_id uuid references waiters (id) on delete set null;
