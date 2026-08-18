-- Slug legível por restaurante, usado como subdomínio da loja
-- (ex. restaurante-demo-sigma.dominio.com), alternativa ao link por UUID
-- (/loja/:restaurantId) que continua existindo. Gerado automaticamente a
-- partir do nome na primeira vez (insert ou primeira vez que o nome muda),
-- mas editável depois pelo admin — o trigger só age quando slug ainda é
-- null, então nunca sobrescreve um valor já definido manualmente.

create extension if not exists unaccent;

alter table restaurants add column slug text;

create or replace function generate_restaurant_slug(base_name text, restaurant_id uuid)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  suffix int := 1;
begin
  base := lower(regexp_replace(unaccent(coalesce(base_name, 'restaurante')), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if base = '' then
    base := 'restaurante';
  end if;

  candidate := base;
  while exists (select 1 from restaurants where slug = candidate and id <> restaurant_id) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

create or replace function restaurants_set_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    new.slug := generate_restaurant_slug(new.name, new.id);
  end if;
  return new;
end;
$$;

create trigger restaurants_slug_before_insert
  before insert on restaurants
  for each row execute function restaurants_set_slug();

create trigger restaurants_slug_before_update
  before update of name on restaurants
  for each row
  when (new.slug is null)
  execute function restaurants_set_slug();

-- Backfill sequencial (não UPDATE em lote) pra evitar colisão entre linhas
-- com nome igual/parecido (ex. placeholders "Novo restaurante" nunca
-- completados) sendo resolvidas na mesma passada sem enxergar umas às outras.
do $$
declare r record;
begin
  for r in select id, name from restaurants where slug is null order by created_at loop
    update restaurants set slug = generate_restaurant_slug(r.name, r.id) where id = r.id;
  end loop;
end $$;

alter table restaurants alter column slug set not null;
alter table restaurants add constraint restaurants_slug_unique unique (slug);
