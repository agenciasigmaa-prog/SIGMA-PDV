-- Bucket para imagens de categorias e produtos do cardápio, organizado como
-- {restaurant_id}/{categories|products}/{uuid}.{ext} pra permitir escrita
-- escopada por tenant via storage.foldername(name)[1] = restaurant_id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
);

-- Leitura pública (cardápio do storefront precisa renderizar sem login)
create policy menu_images_read on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-images');

-- Escrita: admin ou dono/staff do tenant, restrito à própria pasta de restaurant_id
create policy menu_images_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-images'
    and (
      (select current_app_role()) = 'admin'
      or (
        (select current_app_role()) in ('restaurant_owner', 'restaurant_staff')
        and (storage.foldername(name))[1] = (select current_restaurant_id())::text
      )
    )
  );

create policy menu_images_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-images'
    and (
      (select current_app_role()) = 'admin'
      or (
        (select current_app_role()) in ('restaurant_owner', 'restaurant_staff')
        and (storage.foldername(name))[1] = (select current_restaurant_id())::text
      )
    )
  )
  with check (
    bucket_id = 'menu-images'
    and (
      (select current_app_role()) = 'admin'
      or (
        (select current_app_role()) in ('restaurant_owner', 'restaurant_staff')
        and (storage.foldername(name))[1] = (select current_restaurant_id())::text
      )
    )
  );

create policy menu_images_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-images'
    and (
      (select current_app_role()) = 'admin'
      or (
        (select current_app_role()) in ('restaurant_owner', 'restaurant_staff')
        and (storage.foldername(name))[1] = (select current_restaurant_id())::text
      )
    )
  );
