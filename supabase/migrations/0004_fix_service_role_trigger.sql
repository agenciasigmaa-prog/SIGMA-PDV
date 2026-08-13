-- prevent_role_escalation bloqueava até as próprias Edge Functions (rodando como
-- service_role), já que auth.uid() é nulo nesse contexto e cai no ramo "não é admin".
-- service_role já bypassa RLS por padrão no Supabase; aqui deixamos explícito que
-- ele também bypassa esta trigger.
create or replace function prevent_role_escalation() returns trigger
language plpgsql security definer set search_path = public
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
