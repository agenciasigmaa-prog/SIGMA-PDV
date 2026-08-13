-- "Novo restaurante" passa a ser um clique só: sem formulário pro ADM preencher
-- antes. A Edge Function cria um restaurante placeholder com um invite_token
-- aleatório e devolve o link na hora; o dono escolhe o próprio e-mail/senha ao
-- abrir o link, e edita nome/contato depois no painel dele.
alter table restaurants add column invite_token uuid unique;

-- handle_new_user agora reconhece um invite_token no metadata do auth.users (setado
-- tanto pelo signUp público quanto pelo admin.createUser da complete-invite) e já
-- vincula o profile ao restaurante pendente numa única inserção — não passa pela
-- trigger prevent_role_escalation (que só dispara em UPDATE), então funciona
-- independente do bug do current_user em security definer que corrigimos em 0005.
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
