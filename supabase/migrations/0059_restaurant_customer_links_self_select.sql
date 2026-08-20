-- 0058 deu ao cliente permissão de INSERT no próprio vínculo
-- (restaurant_customer_links_insert_self), mas nenhuma permissão de SELECT.
-- Isso quebrava exatamente o caso de uso pretendido: o storefront faz um
-- upsert (INSERT ... ON CONFLICT DO NOTHING) a cada visita logada, e o
-- Postgres precisa que o próprio cliente consiga enxergar a linha existente
-- pra resolver o conflito com segurança — sem policy de SELECT pra ele, todo
-- upsert (mesmo em cima de uma linha já existente) falhava com "new row
-- violates row-level security policy", em vez de simplesmente não fazer
-- nada na segunda visita. Confirmado na prática: um trigger de diagnóstico
-- mostrou auth.uid() batendo perfeitamente com customer_id (a policy de
-- INSERT em si estava correta) — o upsert só voltou a funcionar (201) depois
-- de adicionar esta policy de leitura da própria linha.
create policy restaurant_customer_links_select_self on public.restaurant_customer_links
  for select to authenticated
  using (customer_id = auth.uid());
