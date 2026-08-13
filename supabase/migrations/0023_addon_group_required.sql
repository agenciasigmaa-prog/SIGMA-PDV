-- Adicional obrigatório: cliente precisa selecionar pelo menos 1 unidade
-- de algum adicional deste grupo antes de confirmar (validado no client e
-- revalidado no servidor, mesmo padrão de tudo que mexe em preço/pedido).
alter table addon_groups add column required boolean not null default false;
