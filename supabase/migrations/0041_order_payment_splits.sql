-- Divisão de conta: uma ou mais "partes de pagamento" por pedido (divisão
-- igualitária, por item, ou valor livre), cada uma paga separadamente e com
-- forma de pagamento própria. O pedido original (orders/order_items) não
-- muda — continua sendo a fonte da verdade do que foi consumido e do total;
-- a divisão é só uma forma de organizar o recebimento desse total.
create table order_payment_splits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,

  -- Denormalizado (mesmo padrão de print_jobs em 0039_printbridge.sql), mesmo
  -- sendo derivável via join em order_id: simplifica a policy RLS pro padrão
  -- idiomático do projeto e permite filtro de canal realtime (postgres_changes
  -- só filtra por coluna simples, não por join).
  restaurant_id uuid not null references restaurants (id) on delete cascade,

  label text not null,
  amount numeric not null default 0 check (amount >= 0),
  payment_method payment_method,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,

  -- Registro leve de "foi pago e depois desfeito" — sem tabela de auditoria
  -- separada, paid_at antigo fica como histórico quando isso acontece.
  voided_at timestamptz,

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index order_payment_splits_order_idx on order_payment_splits (order_id);
create index order_payment_splits_restaurant_idx on order_payment_splits (restaurant_id);

alter table order_payment_splits enable row level security;

-- Igual order_items: nenhuma mutação direta pro staff, só leitura via RLS.
-- Toda escrita (criar divisão, marcar pago, desfazer) precisa validar contra
-- o pedido/outros splits — mutação não-trivial, então vai por Edge Function
-- com service_role, mesmo padrão do resto do projeto.
create policy order_payment_splits_staff_select on order_payment_splits
  for select to authenticated
  using (restaurant_id = current_restaurant_id() or current_app_role() = 'admin');

-- Não existe migration versionada habilitando realtime neste projeto (feito
-- historicamente por toggle no Dashboard) — inclui aqui explicitamente pra
-- não depender de passo manual depois do deploy.
alter publication supabase_realtime add table order_payment_splits;

-- Fonte única de verdade pra "payment_status só fica paid quando não há parte
-- pendente". Protege qualquer caminho que tente setar payment_status='paid'
-- (advanceStatus, registerPayment, futuro código) sem precisar caçar cada
-- call site no client. Também bloqueia cancelar pedido com parte já paga.
-- Não mexe na coluna status do kanban — avançar pra "Concluído" continua
-- funcionando igual hoje mesmo com divisão pendente, só o flag de pagamento é
-- protegido.
create or replace function guard_order_payment_updates() returns trigger
language plpgsql as $$
begin
  if new.payment_status = 'paid' and exists (
    select 1 from order_payment_splits where order_id = new.id and status = 'pending'
  ) then
    new.payment_status := old.payment_status;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and exists (
    select 1 from order_payment_splits where order_id = new.id and status = 'paid'
  ) then
    raise exception 'Não é possível cancelar pedido com partes da conta já pagas';
  end if;

  return new;
end;
$$;

create trigger orders_guard_payment_updates
  before update on orders
  for each row execute function guard_order_payment_updates();
