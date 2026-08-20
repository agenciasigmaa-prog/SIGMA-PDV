-- Convite especial de "primeiro mês grátis" — admin gera o link já marcando
-- essa opção (NewRestaurantModal), o restaurante nasce liberado
-- (status='active') sem precisar passar pela Cobrança, mas só até
-- free_trial_until: passado esse prazo, o acesso volta a ser bloqueado (ver
-- ProtectedRoute.tsx em restaurante/) a não ser que um pagamento real já
-- tenha chegado (cakto-webhook zera este campo assim que confirma o
-- primeiro pagamento de verdade, ver comentário na função). NULL = nunca
-- teve trial, comportamento igual a hoje.
alter table public.restaurants add column free_trial_until timestamptz;
