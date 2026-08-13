-- 0002 revogou EXECUTE de PUBLIC, mas o Supabase concede EXECUTE explícito a
-- anon/authenticated via default privileges do schema public, independente
-- do pseudo-role PUBLIC — precisa revogar dos dois roles nomeadamente.
revoke execute on function current_app_role() from anon, authenticated;
revoke execute on function current_restaurant_id() from anon, authenticated;
revoke execute on function handle_new_user() from anon, authenticated;
revoke execute on function prevent_role_escalation() from anon, authenticated;

grant execute on function current_app_role() to authenticated;
grant execute on function current_restaurant_id() to authenticated;
