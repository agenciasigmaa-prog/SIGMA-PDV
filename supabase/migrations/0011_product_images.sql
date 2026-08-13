-- Galeria de fotos por produto (várias, não uma só). products.image_url
-- continua como "capa" — sincronizada pra primeira foto da galeria — pra não
-- precisar reescrever todo lugar que hoje só mostra uma imagem (lista, card
-- do cliente, carrinho).
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0
);

create index product_images_product_id_idx on product_images (product_id);

alter table product_images enable row level security;

-- Pública pra leitura — mesmo espírito de products (o storefront do cliente
-- também vai poder mostrar essas fotos no futuro).
create policy product_images_select on product_images for select
  to anon, authenticated
  using (true);

create policy product_images_write on product_images for all
  to authenticated
  using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  )
  with check (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );
