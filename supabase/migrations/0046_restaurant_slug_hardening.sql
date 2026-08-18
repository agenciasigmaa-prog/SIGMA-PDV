-- Corrige avisos do linter introduzidos pela migration anterior
-- (restaurant_slug): search_path mutável nas funções novas e a extensão
-- unaccent instalada no schema public em vez de extensions.

alter schema extensions owner to postgres;
drop extension unaccent;
create extension unaccent with schema extensions;

create or replace function generate_restaurant_slug(base_name text, restaurant_id uuid)
returns text
language plpgsql
set search_path = public, extensions
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
set search_path = public
as $$
begin
  if new.slug is null then
    new.slug := generate_restaurant_slug(new.name, new.id);
  end if;
  return new;
end;
$$;
