# Funcionalidades do painel `admin/`

Mapa de tudo que o painel da agência faz hoje, por que existe, e o resultado do teste rodado uma a uma em 2026-08-12 contra o projeto Supabase real (`qedslrbzgklsxcbuokbl`), usando a conta admin existente e a conta de demonstração criada nesta rodada (veja `## Conta de demonstração` no final).

Sem acesso a browser automatizado neste ambiente — todo teste abaixo foi feito direto contra a API real (auth, PostgREST, Edge Functions) via `curl`, mais `execute_sql` pra conferir o estado final no banco, e a suite Vitest pra lógica pura. Isso testa exatamente o que a UI chama por baixo, só sem o clique.

## Login (`/login`)

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Entrar com e-mail/senha | `supabase.auth.signInWithPassword`, redireciona pra `/dashboard` | Porta de entrada única do painel — sem isso ninguém acessa nada | `POST /auth/v1/token?grant_type=password` com a conta admin | ✅ 200, JWT válido |
| Redirecionar sessão já ativa | Se já tem sessão, pula o form e vai direto pro dashboard | Evita re-login desnecessário | Lido no código (`useEffect` em `Login.tsx`) — comportamento óbvio, sem risco de RLS por trás | ✅ (revisão de código) |

## Guarda de acesso (`ProtectedRoute` + RLS)

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Bloquear quem não é `admin` | Redireciona pra `/login` sem sessão, ou mostra "Acesso não autorizado" se `profile.role !== 'admin'` | Garante que só a agência entra no painel — um dono de restaurante logado não pode acessar dados de outros tenants | JWT da conta demo (`restaurant_owner`) contra uma Edge Function admin-only | ✅ 403 `Forbidden: admin role required` — o mesmo gate que a Edge Function usa é o que o front espelha |

## Dashboard (`/dashboard`)

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Cards de restaurantes ativos/total | Conta `restaurants` por status | Visão rápida de quantos tenants a agência tem e em que estágio | `execute_sql`: `select status, count(*) from restaurants group by status` comparado com os cards | ✅ 1 active, 1 onboarding (batendo com o estado real no momento do teste) |
| Unidades vendidas | `sum(order_items.quantity)` sem filtro de restaurante/data | Termômetro de volume de vendas da agência como um todo | `execute_sql`: `select sum(quantity) from order_items` | ✅ 7 (bate com os 3 pedidos demo seedados: 2+1 + 1+1 + 1+1) |
| Faturamento total | `sum(orders.total)` onde `payment_status = 'paid'` | Receita real (só o que foi de fato pago) | `execute_sql` recalculando a mesma soma | ✅ R$ 106,20 (os 2 pedidos demo pagos; o 3º está `pending` e corretamente excluído) |
| Ranking por faturamento (top 5) | Agrupa pedidos pagos por restaurante, ordena desc | Mostra quem são os melhores clientes da agência | `execute_sql` com o mesmo `group by`/`order by` da query do Dashboard | ✅ "Restaurante Demo Sigma" no topo com R$ 106,20 |

**Conhecido e deixado de fora nesta rodada**: a query não filtra por data nem pagina — sem volume real de pedidos ainda (só os 3 de demo), otimizar agora seria prematuro.

## Kanban (`/kanban`)

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Colunas por status | Agrupa restaurantes em onboarding/active/suspended/cancelled | Visão de pipeline — em que fase cada cliente da agência está | Revisão de código + dados reais no banco | ✅ |
| Avançar status (botão "Mover para X") | Chama `admin-set-account-status`, que atualiza `restaurants.status` e loga em `admin_action_log` | É como a agência move um restaurante de onboarding pra ativo, ou sinaliza risco/cancelamento | Ciclo completo `onboarding → active → suspended → cancelled → active` no restaurante demo via `POST admin-set-account-status` | ✅ 5/5 transições HTTP 200, cada uma gerou uma linha em `admin_action_log` (conferido via `execute_sql`) |

## Restaurantes (`/restaurantes`)

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Listar + buscar (nome/contato/e-mail) | `filterRestaurants` (lib pura) sobre a lista carregada | Achar um tenant específico rápido | `admin/src/lib/restaurant.test.ts` (6 casos: nome, contato, e-mail, case-insensitive, sem match, campos nulos) + confirmação que o restaurante demo aparece na listagem via REST | ✅ suite verde + restaurante demo visível |
| Mudar status inline (`<select>`) | Mesma Edge Function do Kanban | Atalho pra quem prefere lista a quadro | Coberto pelo teste do Kanban acima (mesma function) | ✅ |
| **Novo restaurante** (modo convite) | `admin-create-restaurant` sem `owner_password` — cria placeholder + `invite_token`, devolve link pra copiar | Onboarding sem fricção: a agência só clica, o dono escolhe a própria senha depois | Criado restaurante descartável → `check-invite` (token válido → `valid:true`; token inválido → `valid:false`) → `complete-invite` (cria a conta) → conferido via `execute_sql` que o profile ficou `restaurant_owner` vinculado ao restaurante certo e o `invite_token` foi zerado | ✅ fluxo completo ponta a ponta — restaurante de teste **apagado depois**, não é o de demonstração |
| **Adicionar manualmente** | `admin-create-restaurant` com `owner_password` — cria restaurante + conta do dono já confirmada, sem link | Pra quando a agência já tem os dados do cliente na mão | É exatamente como a conta de demonstração foi criada nesta rodada | ✅ `Restaurante Demo Sigma` criado, login como o dono funcionou de primeira |
| **Editar** — dados do restaurante | `update` direto em `restaurants` via RLS (`current_app_role() = 'admin'`) | Corrigir nome/contato depois da criação | Revisão de código (mesma RLS já validada em outras tabelas) | ✅ (padrão já coberto por RLS testada) |
| **Editar** — ver/editar dono | `admin-manage-owner` (`get_owner`/`update_owner`) | Trocar e-mail/senha/nome/telefone de login do dono sem ele precisar pedir | `get_owner` no dono demo → dados corretos; `update_owner` com `full_name`/`phone` novos → `execute_sql` confirma que `profiles` foi atualizado | ✅ |
| **Editar** — gerar link de redefinição de senha *(novo nesta rodada)* | Botão que chama `admin-reset-password`, mostra o link pra copiar | Antes desta rodada a Edge Function existia mas **nenhuma tela chamava ela** — código morto | `POST admin-reset-password` pro dono demo | ✅ 200, `action_link` retornado. **Limitação conhecida**: o link não é enviado por e-mail de verdade (SMTP do projeto não está configurado — já era um TODO no código); a agência precisa copiar e mandar manualmente, igual ao link de convite |

## Pedidos (`/pedidos`) — novo nesta rodada

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Listar pedidos de todos os restaurantes | `orders` + join `restaurants(name)`, mais recente primeiro | Antes desta rodada a agência não tinha visão nenhuma de pedidos além dos números agregados do Dashboard | `execute_sql` com o mesmo `select`/`join`/`order by` da query da tela | ✅ 3 pedidos demo retornados com nome do restaurante, tipo, status e total corretos |
| Buscar por nome do restaurante | `filterOrders` (lib pura) | Achar pedidos de um tenant específico numa lista que cresce | `admin/src/lib/orders.test.ts` | ✅ |
| Filtrar por status | `<select>` client-side sobre a lista já carregada | Focar em pedidos "recebido"/"preparando" etc. | Revisão de código (filtro trivial sobre enum já coberto pelo teste de label) | ✅ |
| Somente leitura (sem editar status) | Decisão deliberada — mudar status de pedido é operação do restaurante (futuro `restaurante/`), não da agência | Mantém a responsabilidade no dono certo | — | Fora de escopo por design, não é lacuna |

## Auditoria (`/auditoria`)

| Funcionalidade | O que faz | Função real | Como foi testado | Resultado |
|---|---|---|---|---|
| Listar últimas 200 ações | `admin_action_log` + join `restaurants(name)` *(join novo nesta rodada — antes só mostrava o UUID cru)* | Rastro de auditoria de tudo que qualquer conta admin faz | `execute_sql` no restaurante demo: 9 entradas, uma pra cada ação testada acima (`restaurant_created`, 5× `account_status_changed`, `owner_account_updated`, `password_reset`) | ✅ todas presentes, na ordem certa |
| Detalhes legíveis *(novo nesta rodada)* | `formatAuditDetails` transforma o JSON em "chave: valor" em vez de `JSON.stringify` cru | Antes era ilegível pra conferir o que mudou sem abrir o devtools | `admin/src/lib/auditLog.test.ts` (null, vazio, chave simples, array, objeto aninhado, valor nulo) | ✅ |
| Buscar por ação ou restaurante *(novo nesta rodada)* | `filterAuditEntries` | Achar uma ação específica numa lista que só cresce | `admin/src/lib/auditLog.test.ts` | ✅ |

## Fora de escopo nesta rodada (decisão explícita, não esquecimento)

- **Gestão de staff** (`restaurant_staff`) pelo admin — mais natural como autoatendimento do próprio dono dentro do `restaurante/`.
- **Paginação em Restaurantes** — poucos tenants hoje.
- **Otimizar a query do Dashboard** — sem volume real de pedidos, seria prematuro.
- **Envio de e-mail real no reset de senha** — depende de SMTP configurado no projeto (decisão de infra).

## Suite automatizada

`cd admin && npm run test` → **28/28 testes passando** (`functionError`, `restaurant`, `orders`, `auditLog`). `npm run lint` e `npm run build` limpos. `mcp__supabase__get_advisors` sem regressão nova em relação à baseline do projeto.

## Conta de demonstração

Fica **permanente** no banco (não é limpa depois, ao contrário das contas descartáveis usadas só pra provar o fluxo de convite):

- Restaurante: **Restaurante Demo Sigma** (`id 15778778-57c0-4792-9bf3-e5315020dcf7`), status `active`
- Login do dono: **agenciasigmaa+demo@gmail.com** / **SigmaDemo2026!**
- Cardápio: 2 categorias (Hambúrgueres, Bebidas), 4 produtos
- 3 pedidos de exemplo (1 pago/concluído, 1 pago/preparando, 1 pendente/recebido) — é o que alimenta os números do Dashboard e da tela de Pedidos
