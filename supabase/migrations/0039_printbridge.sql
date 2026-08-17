-- PrintBridge: impressão automática de comanda em impressora térmica.
--
-- Quarta tentativa. As três anteriores (QZ Tray, shell WebView2, agente de
-- bandeja) morreram por dependerem do navegador falar com o PC. Um spike em
-- 15/08/2026 provou que esse caminho piorou de vez: o Chrome 142+ trocou o
-- modelo "só header" do Private Network Access por Local Network Access, que
-- é uma PERMISSÃO de usuário — uma página https pública simplesmente não
-- alcança 127.0.0.1 sem o operador conceder um prompt.
--
-- Por isso aqui o navegador não participa da impressão. O fluxo é:
--
--   pedido inserido -> trigger enfileira print_jobs -> agente no PC do
--   balcão consulta por HTTPS de saída (que nada bloqueia) e imprime.
--
-- Nenhuma aba precisa estar aberta, nenhuma porta local é escutada.

-- Estação = um PC com impressora, pareado a um restaurante.
create table print_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,

  -- Identidade da máquina, gerada pelo agente na primeira execução e
  -- guardada por ele. É o que permite reparear o mesmo PC sem duplicar linha.
  agent_id text not null,

  -- Só o SHA-256 do token de estação. Se alguém copiar esta tabela, não
  -- extrai credencial utilizável.
  token_hash text not null,

  printer_name text,
  paper_width smallint not null default 80 check (paper_width in (58, 80)),
  copies smallint not null default 1 check (copies between 1 and 5),
  auto_print boolean not null default true,

  -- Lista de impressoras publicada pelo próprio agente a cada consulta. É a
  -- fonte do select da tela de configuração — o site nunca fala com o PC,
  -- então esta é a única forma de ele saber o que existe na máquina.
  printers jsonb not null default '[]'::jsonb,

  -- Alimentado a cada consulta do agente. "Estação online" é derivado disso.
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),

  unique (restaurant_id, agent_id)
);

-- Pareamento: o agente cria o código, o operador digita no site.
--
-- O agente não pode simplesmente informar em qual restaurante quer entrar —
-- quem amarra é o site, usando o restaurant_id do perfil de quem está
-- logado. O código de 6 dígitos prova posse física da máquina.
create table print_pairings (
  code text primary key,
  agent_id text not null,
  machine_name text not null,

  -- SHA-256 do token que o agente sorteou na própria máquina. O valor bruto
  -- nunca sai do PC — nem no pareamento. Na confirmação este hash é copiado
  -- pra print_stations.
  token_hash text not null,

  restaurant_id uuid references restaurants (id) on delete cascade,
  station_id uuid references print_stations (id) on delete cascade,
  confirmed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index print_pairings_agent_idx on print_pairings (agent_id);

-- Fila de impressão.
create table print_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,

  -- Nulo = qualquer estação do restaurante pode pegar. Hoje é sempre nulo;
  -- existe pra quando um restaurante tiver cozinha e balcão com impressoras
  -- separadas.
  station_id uuid references print_stations (id) on delete set null,

  order_id uuid references orders (id) on delete cascade,
  document_type text not null check (
    document_type in ('comanda_cozinha', 'comanda_entrega', 'conta_mesa', 'teste')
  ),

  -- Derivada (order_id + tipo), nunca aleatória: reprocessar o mesmo pedido
  -- gera a mesma chave, e o unique abaixo impede fisicamente a segunda via.
  idempotency_key text not null,

  state text not null default 'pending' check (
    state in ('pending', 'claimed', 'printed', 'failed')
  ),
  attempts integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (restaurant_id, idempotency_key)
);

-- Índice da consulta do agente: pendentes de um restaurante, mais antigo
-- primeiro.
create index print_jobs_pending_idx on print_jobs (restaurant_id, state, created_at);

-- Enfileira a comanda no INSERT do pedido.
--
-- Roda no banco, e não no navegador, de propósito: o pedido pode nascer do
-- storefront, do ManualOrderModal ou de qualquer coisa futura, e a comanda
-- precisa sair igual nos três casos, com ou sem alguém olhando a tela.
--
-- Só enfileira se existir estação com impressão automática ligada — sem
-- isso, restaurante sem impressora acumularia fila morta pra sempre.
create or replace function enqueue_print_job() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_document_type text;
begin
  if not exists (
    select 1 from print_stations
    where restaurant_id = new.restaurant_id and auto_print
  ) then
    return new;
  end if;

  v_document_type := case
    when new.order_type = 'delivery' then 'comanda_entrega'
    else 'comanda_cozinha'
  end;

  insert into print_jobs (restaurant_id, order_id, document_type, idempotency_key)
  values (new.restaurant_id, new.id, v_document_type, new.id::text || ':' || v_document_type)
  on conflict (restaurant_id, idempotency_key) do nothing;

  return new;
end;
$$;

create trigger orders_enqueue_print_job
  after insert on orders
  for each row execute function enqueue_print_job();

-- Função de trigger não é pra ser chamada por ninguém direto. O Postgres já
-- recusaria ("trigger functions can only be called as triggers"), mas sem o
-- revoke ela aparece exposta em /rest/v1/rpc e o linter de segurança acusa.
revoke execute on function enqueue_print_job() from anon, authenticated;

-- Reivindicação atômica da fila.
--
-- Precisa ser uma função no banco, e não um select seguido de update na Edge
-- Function: entre os dois, duas estações (ou duas consultas da mesma, se uma
-- demorar) pegariam o mesmo job e a comanda sairia duas vezes. O
-- `for update skip locked` faz cada linha sair pra um consumidor só.
create or replace function claim_print_jobs(
  p_station_id uuid,
  p_restaurant_id uuid,
  p_limit integer
) returns setof print_jobs
language plpgsql security definer set search_path = public
as $$
begin
  -- Job que ficou 'claimed' e nunca voltou = agente morreu no meio (queda de
  -- energia, processo morto). Depois de 2 minutos volta pra fila, senão a
  -- comanda some pra sempre.
  update print_jobs
     set state = 'pending', updated_at = now()
   where restaurant_id = p_restaurant_id
     and state = 'claimed'
     and claimed_at < now() - interval '2 minutes';

  return query
  update print_jobs j
     set state = 'claimed',
         claimed_at = now(),
         station_id = p_station_id,
         attempts = j.attempts + 1,
         updated_at = now()
   where j.id in (
     select id from print_jobs
      where restaurant_id = p_restaurant_id
        and state = 'pending'
        and (station_id is null or station_id = p_station_id)
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning j.*;
end;
$$;

-- Só a Edge Function (service role) chama. Ninguém logado no site tem
-- motivo pra reivindicar job de impressão.
revoke execute on function claim_print_jobs(uuid, uuid, integer) from anon, authenticated;

-- RLS. O agente NÃO passa por aqui: ele fala só com Edge Functions, que
-- validam o token de estação e usam service role. Estas policies são pro
-- app do restaurante (tela de configuração e reimpressão).
alter table print_stations enable row level security;
alter table print_pairings enable row level security;
alter table print_jobs enable row level security;

-- Padrão do projeto: helper security definer, nunca subquery inline em
-- policy (evita recursão de RLS) — mesmo motivo do 0002.
create policy print_stations_staff_all on print_stations
  for all to authenticated
  using (restaurant_id = current_restaurant_id() or current_app_role() = 'admin')
  with check (restaurant_id = current_restaurant_id() or current_app_role() = 'admin');

create policy print_jobs_staff_all on print_jobs
  for all to authenticated
  using (restaurant_id = current_restaurant_id() or current_app_role() = 'admin')
  with check (restaurant_id = current_restaurant_id() or current_app_role() = 'admin');

-- print_pairings não tem policy nenhuma de propósito: o código de pareamento
-- só é manipulado por Edge Function com service role (que ignora RLS). Com
-- RLS ligada e sem policy, ninguém mais lê nem escreve — inclusive um staff
-- logado não consegue varrer códigos pendentes de outra máquina.
