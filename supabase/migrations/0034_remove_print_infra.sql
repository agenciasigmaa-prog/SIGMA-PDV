-- Remove toda a infraestrutura de impressão automática de comanda. As
-- tentativas anteriores (QZ Tray, shell WebView2, agente de bandeja com
-- ESC/POS RAW) foram removidas do repositório sem nunca terem funcionado em
-- produção — a próxima tentativa será desenhada do zero, então o banco não
-- deve carregar nada da anterior.
--
-- Tudo com "if exists" de propósito: num banco novo, esta migration roda
-- depois da 0033 sem que nada disso tenha sido criado, e precisa ser um
-- no-op em vez de erro.

-- Terminal de impressão pareado: um auth.users próprio com papel
-- 'print_agent'. Precisa sair ANTES da constraint ser restaurada abaixo —
-- o profile dele tem restaurant_id preenchido com um papel que a constraint
-- original não prevê. O cascade limpa profile e print_agents junto.
delete from auth.users where id in (select id from profiles where role = 'print_agent');

-- Fila de impressão e pareamento de terminais. O drop de print_jobs já a
-- remove da publicação supabase_realtime.
drop table if exists print_jobs;
drop table if exists print_agents;
drop table if exists print_agent_pairings;

-- handle_new_user volta à versão do 0006: só o ramo do invite_token, sem
-- reconhecer código de pareamento de terminal nenhum.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_token uuid;
  v_restaurant_id uuid;
begin
  begin
    v_token := (new.raw_user_meta_data ->> 'invite_token')::uuid;
  exception when others then
    v_token := null;
  end;

  if v_token is not null then
    select id into v_restaurant_id from restaurants where invite_token = v_token;
  end if;

  if v_restaurant_id is not null then
    insert into public.profiles (id, role, restaurant_id) values (new.id, 'restaurant_owner', v_restaurant_id);
    update restaurants set invite_token = null where id = v_restaurant_id;
  else
    insert into public.profiles (id) values (new.id);
  end if;

  return new;
end;
$$;

-- Constraint volta à versão do 0001: só owner/staff exigem restaurant_id.
alter table profiles drop constraint if exists staff_requires_restaurant;
alter table profiles add constraint staff_requires_restaurant check (
  (role in ('restaurant_owner', 'restaurant_staff')) = (restaurant_id is not null)
);

-- Bucket público que hospedava o instalador do app nativo. Só as policies
-- saem por aqui: o Supabase bloqueia DELETE direto em storage.objects e
-- storage.buckets com o trigger storage.protect_delete() ("Direct deletion
-- from storage tables is not allowed. Use the Storage API instead"), então
-- um `delete from storage.buckets` aqui derruba a migration inteira. O
-- arquivo e o bucket são removidos pelo Dashboard/Storage API, fora daqui.
-- Sem as policies abaixo o bucket já fica inerte, que é o que importa.
drop policy if exists "sigma_print_app_read" on storage.objects;
drop policy if exists "sigma_print_app_write" on storage.objects;
drop policy if exists "sigma_print_app_update" on storage.objects;

-- Nota: o valor 'print_agent' continua no enum app_role. Postgres não tem
-- DROP VALUE, e recriar o tipo exigiria dropar current_app_role() com
-- CASCADE — o que derrubaria todas as policies de RLS do projeto. O valor
-- fica órfão e inerte (nenhum profile o usa, nenhuma policy o cita).
