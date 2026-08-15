-- Bucket "sigma-print-app" (público, criado manualmente pelo Dashboard --
-- Storage não permite criar bucket junto com a policy numa migration só
-- de forma idempotente sem risco de conflito com o que já existe) guarda o
-- instalador (.zip) do app nativo de impressão (printer-app/). Só a leitura
-- é pública; upload/gestão do arquivo fica restrito a admin/staff, mesmo
-- padrão de policy já usado no bucket menu-images.

create policy "sigma_print_app_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'sigma-print-app');

create policy "sigma_print_app_write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'sigma-print-app'
  and (
    current_app_role() = 'admin'
    or current_app_role() in ('restaurant_owner', 'restaurant_staff')
  )
);

create policy "sigma_print_app_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'sigma-print-app'
  and (
    current_app_role() = 'admin'
    or current_app_role() in ('restaurant_owner', 'restaurant_staff')
  )
);
