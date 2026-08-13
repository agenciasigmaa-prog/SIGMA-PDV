-- Evita 2 policies permissivas competindo no SELECT (mesmo ajuste já feito
-- pra restaurants em 0002_harden_rls.sql) — separa insert/update/delete da
-- leitura, que já tem policy própria.
drop policy product_images_write on product_images;

create policy product_images_insert on product_images for insert
  to authenticated
  with check (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );

create policy product_images_update on product_images for update
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

create policy product_images_delete on product_images for delete
  to authenticated
  using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and (current_app_role() = 'admin' or p.restaurant_id = current_restaurant_id())
    )
  );
