-- Abre retirada e delivery pro próprio cliente no cardápio público (antes só
-- existiam via pedido manual do staff). Duas peças novas:

-- 1. Bairro precisa ser público (nome + taxa) pro cliente escolher no
-- checkout de delivery — mesmo racional de categories/products/restaurants
-- já serem públicos. Só bairro ativo aparece (mesmo filtro que a tela de
-- staff já usa na leitura).
create policy neighborhoods_select_public on neighborhoods for select
  to anon, authenticated
  using (active);

-- 2. Endereço salvo por cliente, reaproveitável em qualquer restaurante que
-- ele peça depois — bairro/taxa NÃO entra aqui de propósito, porque é por
-- restaurante; só o texto do endereço é reaproveitado, o bairro é escolhido
-- de novo a cada checkout.
create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  label text,
  address_text text not null,
  created_at timestamptz not null default now()
);

alter table customer_addresses enable row level security;

create policy customer_addresses_own on customer_addresses for all
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());
