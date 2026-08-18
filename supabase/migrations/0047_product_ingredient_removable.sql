-- Até aqui, todo ingrediente da ficha técnica de um produto era removível
-- pelo cliente na loja (ex. tirar o pão de um hambúrguer, o que não faz
-- sentido). Agora cada linha da ficha técnica tem seu próprio controle:
-- dono decide, ingrediente por ingrediente, se o cliente pode tirá-lo.
-- Default true preserva o comportamento atual pra ficha técnica já
-- cadastrada — não quebra nada, só passa a existir a opção de travar.
alter table product_ingredients add column removable boolean not null default true;

-- A view pública só deve listar o que pode mesmo ser removido — filtrar
-- aqui, num único lugar, evita repetir a checagem em cada consumidor
-- (storefront e as duas Edge Functions que validam remoção de ingrediente).
create or replace view public_removable_ingredients with (security_invoker = false) as
  select pi.product_id, pi.ingredient_id, i.name, p.restaurant_id
  from product_ingredients pi
  join ingredients i on i.id = pi.ingredient_id
  join products p on p.id = pi.product_id
  where pi.removable;
