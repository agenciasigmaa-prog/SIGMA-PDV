-- 0004 tentou liberar o service_role checando `current_user = 'service_role'`, mas
-- prevent_role_escalation é `security definer`: dentro de uma função security definer
-- o Postgres troca current_user pelo DONO da função (postgres), não pelo role que
-- fez a chamada. Por isso o bypass nunca disparava e a Edge Function continuava
-- batendo no "not authorized to change role or restaurant_id".
-- Removendo security definer daqui, current_user volta a refletir o role real da
-- chamada (service_role nas Edge Functions). current_app_role() continua security
-- definer, então a checagem de recursão de RLS nas policies de profiles não muda.
create or replace function prevent_role_escalation() returns trigger
language plpgsql set search_path = public
as $$
begin
  if current_user = 'service_role' then
    return new;
  end if;

  if current_app_role() is distinct from 'admin' then
    if new.role <> old.role or new.restaurant_id is distinct from old.restaurant_id then
      raise exception 'not authorized to change role or restaurant_id';
    end if;
  end if;
  return new;
end;
$$;
