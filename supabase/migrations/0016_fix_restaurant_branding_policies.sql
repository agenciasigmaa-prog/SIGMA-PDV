drop policy restaurant_branding_all on restaurant_branding;

create policy restaurant_branding_insert on restaurant_branding for insert
  to authenticated
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

create policy restaurant_branding_update on restaurant_branding for update
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id())
  with check (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());

create policy restaurant_branding_delete on restaurant_branding for delete
  to authenticated
  using (current_app_role() = 'admin' or restaurant_id = current_restaurant_id());
