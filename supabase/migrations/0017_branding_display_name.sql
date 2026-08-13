-- Nome exibido pro cliente, editável pelo próprio dono — diferente de
-- restaurants.name, que continua sendo o nome "oficial" da conta, controlado
-- só pela agência (restaurants_update é admin-only, e isso fica assim).
alter table restaurant_branding add column display_name text;
