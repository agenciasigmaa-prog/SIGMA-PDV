-- Ficha técnica: ingredientes reutilizáveis por restaurante e a receita de cada
-- produto, pra calcular CMV (custo da mercadoria vendida) por produto e no
-- agregado do Dashboard, sem mais depender de placeholder.

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('g', 'ml', 'un')),
  package_quantity numeric(10, 3) not null check (package_quantity > 0),
  package_price numeric(10, 2) not null check (package_price >= 0),
  -- Custo por unidade calculado, nunca digitado à mão — dono só informa
  -- "paguei X por Y g/ml/un", igual pensa na hora de comprar.
  cost_per_unit numeric(12, 6) generated always as (package_price / package_quantity) stored,
  created_at timestamptz not null default now()
);

create table product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete cascade,
  quantity_used numeric(10, 3) not null check (quantity_used > 0),
  unique (product_id, ingredient_id)
);

-- CMV por produto pronto pra qualquer consumidor (form do produto, Dashboard)
-- somar sem repetir a conta. security_invoker é obrigatório: sem isso a view
-- roda com o dono da view (bypassa RLS) em vez do chamador real.
create view product_cmv with (security_invoker = true) as
  select pi.product_id, sum(pi.quantity_used * i.cost_per_unit) as cmv
  from product_ingredients pi
  join ingredients i on i.id = pi.ingredient_id
  group by pi.product_id;

alter table ingredients enable row level security;
alter table product_ingredients enable row level security;

-- Nunca pública — diferente de products/categories, custo de insumo é dado
-- sensível do tenant (concorrente não pode ver a margem de ninguém).
create policy ingredients_all on ingredients for all
  to authenticated
  using (
    current_app_role() = 'admin'
    or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id())
  )
  with check (
    current_app_role() = 'admin'
    or (current_app_role() in ('restaurant_owner', 'restaurant_staff') and restaurant_id = current_restaurant_id())
  );

create policy product_ingredients_all on product_ingredients for all
  to authenticated
  using (
    exists (
      select 1 from products p
      where p.id = product_ingredients.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  )
  with check (
    exists (
      select 1 from products p
      where p.id = product_ingredients.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );
