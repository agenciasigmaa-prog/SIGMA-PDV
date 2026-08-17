-- Remove a infraestrutura do PrintBridge (fila de impressão em nuvem via
-- print_stations/print_pairings/print_jobs), substituída pelo agente de
-- impressão local em Go (ver agente/ na raiz do repo e CLAUDE.md, seção
-- "Ticket printing"). A nova arquitetura é 100% local (navegador do
-- restaurante -> 127.0.0.1), então não há mais nada de impressão pra
-- persistir no banco.
--
-- Idempotente, mesmo padrão de 0034_remove_print_infra.sql (a tentativa
-- anterior, com print_jobs/print_agents/print_agent_pairings).
--
-- Nota: assim como em 0034, 'print_agent' continua órfão no enum app_role.
-- Não há como fazer DROP VALUE em enum do Postgres, e recriar o tipo
-- exigiria CASCADE em current_app_role(), o que derrubaria toda RLS do
-- projeto. Não vale o risco por um valor nunca usado.

drop trigger if exists orders_enqueue_print_job on public.orders;
drop function if exists public.enqueue_print_job();
drop function if exists public.claim_print_jobs(uuid, uuid, integer);

drop table if exists public.print_jobs;
drop table if exists public.print_pairings;
drop table if exists public.print_stations;
