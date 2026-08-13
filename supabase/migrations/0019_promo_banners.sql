create table promo_banners (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  image_url text not null,
  title text not null,
  subtitle text,
  cta_label text not null default 'Ver mais',
  active boolean not null default true,
  sort_order int not null default 0
);

create index promo_banners_restaurant_id_idx on promo_banners (restaurant_id);
create index promo_banners_category_id_idx on promo_banners (category_id);

alter table promo_banners enable row level security;

-- Pública pra leitura, igual products/categories — o carrossel do cliente
-- precisa mostrar os banners sem login.
create policy promo_banners_select on promo_banners for select
  to anon, authenticated
  using (true);

create policy promo_banners_insert on promo_banners for insert
  to authenticated
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

create policy promo_banners_update on promo_banners for update
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id())
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

create policy promo_banners_delete on promo_banners for delete
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());
