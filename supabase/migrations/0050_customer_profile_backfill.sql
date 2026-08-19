-- Documenta em arquivo uma mudança que já foi aplicada direto em produção
-- (migration remota "20260818000227 | 0045_customer_profile_fields", visível
-- em supabase_migrations.schema_migrations) mas nunca virou arquivo aqui no
-- repo — mesmo tipo de gap já documentado pra 0027-0029 no CLAUDE.md. Não
-- muda nada no banco de produção (`add column if not exists` + `create or
-- replace function` são idempotentes contra o estado atual); serve pra deixar
-- o histórico de migrations batendo com a realidade e pra um banco novo ficar
-- igual ao de produção.
--
-- profiles.email/profiles.address: cadastro real do cliente (CustomerAuthModal)
-- manda email/telefone/endereço em auth.signUp({ options: { data: {...} } }),
-- e handle_new_user() (abaixo) grava isso em profiles na hora do INSERT —
-- sem essas colunas, restaurante/admin's Clientes.tsx (que já faz
-- select("id, full_name, email, phone, address")) quebraria num banco novo.
alter table profiles add column if not exists email text;
alter table profiles add column if not exists address text;

-- Mesma lógica de sempre pro ramo de convite de dono de restaurante; o ramo
-- "senão" (cliente comum, incluindo login social como Google) agora também
-- grava email/full_name/phone/address vindos de raw_user_meta_data — Google
-- só preenche full_name/email (Supabase normaliza os claims do provider
-- assim), phone/address ficam null até o cliente preencher no Perfil.
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
    insert into public.profiles (id, email, full_name, phone, address)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'phone',
      new.raw_user_meta_data ->> 'address'
    );
  end if;

  return new;
end;
$$;
