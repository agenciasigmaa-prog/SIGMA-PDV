-- O nome do ingrediente precisa ser público (cliente da loja monta o pedido
-- sem cebola/alface/etc sem estar logado), mas o custo em ingredients
-- (package_price, cost_per_unit) é dado sensível do tenant e tem que
-- continuar privado — por isso não dá pra abrir RLS pública direto nas
-- tabelas base (0009_product_ingredients.sql). Uma view sem security_invoker
-- roda como dona (bypassa RLS de product_ingredients/ingredients) e só expõe
-- as colunas seguras, igual ao aviso já deixado em product_cmv.
create view public_removable_ingredients with (security_invoker = false) as
  select pi.product_id, pi.ingredient_id, i.name, p.restaurant_id
  from product_ingredients pi
  join ingredients i on i.id = pi.ingredient_id
  join products p on p.id = pi.product_id;

revoke all on public_removable_ingredients from public;
grant select on public_removable_ingredients to anon, authenticated;
