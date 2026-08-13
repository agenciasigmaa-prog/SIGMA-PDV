-- Evita duas comandas abertas pra mesma mesa (dois clientes confirmando pedido
-- quase ao mesmo tempo). A Edge Function de pedido trata o conflito de unicidade
-- (23505) buscando a sessão aberta já existente em vez de falhar.
create unique index table_sessions_one_open_per_table
  on table_sessions (table_id)
  where status = 'open';

-- O storefront público (cliente sem login navegando o cardápio via QR de mesa)
-- precisa mostrar o nome do restaurante no topo. RLS de restaurants hoje só
-- libera leitura pra admin ou pro próprio tenant logado — abre leitura pública,
-- mesmo espírito de categories/products/tables (cardápio já é público).
create policy restaurants_select_public on restaurants for select
  to anon, authenticated
  using (true);
