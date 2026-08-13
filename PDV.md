# PDV Agência Sigma — Como o sistema funciona

Relatório técnico do que está construído e funcionando hoje, tela por tela, com a peça de backend que sustenta cada uma. O sistema é composto por **três aplicações independentes** (Vite + React 19 + TypeScript + Tailwind v4) que compartilham **um único backend Supabase** (Postgres + Auth + Storage + Edge Functions). Não existe API própria: cada app fala direto com o Supabase, e a autorização é garantida por Row Level Security (RLS) no banco — não por lógica de frontend.

## Modelo de dados e papéis

Uma agência (**ADM**) gerencia vários restaurantes (**tenants**). Cada restaurante tem seu próprio cardápio, mesas e pedidos, isolados dos demais pelo `restaurant_id`. Todo usuário autenticado tem um `profile` com um papel (`role`):

- **`admin`** — time da agência, acessa o painel `admin/`, enxerga todos os tenants.
- **`restaurant_owner` / `restaurant_staff`** — equipe do restaurante, acessa `restaurante/`, só enxerga o próprio tenant.
- **`customer`** — cliente final, criado automaticamente em qualquer signup (Google ou e-mail/senha) por um trigger (`handle_new_user`). Nunca é atribuído manualmente.

Ninguém sobe de papel sozinho: `restaurant_owner` só nasce pelo fluxo de convite do admin, e `admin` não é auto-atribuível — isso é garantido por RLS e por um trigger (`prevent_role_escalation`) que bloqueia `UPDATE` em `profiles.role` fora dos caminhos controlados.

Toda leitura e escrita passa por policies de RLS baseadas em duas funções auxiliares (`current_app_role()`, `current_restaurant_id()`), que leem o perfil do usuário logado sem recursão. `categories`, `products`, `tables` e (parcialmente) `restaurants` são públicas para leitura — o cardápio precisa aparecer pra quem não está logado.

---

## 1. Storefront do cliente final (app raiz, porta 5173)

Onde o cliente sentado à mesa faz o pedido, sem precisar criar conta antes de navegar o cardápio.

### Acesso pela mesa (`/mesa/:token`)

Cada mesa física tem um QR Code impresso apontando para uma URL com um token único (`tables.qr_token`, um UUID gerado automaticamente). Ao abrir o link, o app:

1. Busca a mesa pelo token (`useTableContext`) e resolve o restaurante dono dela.
2. Se o token não existe, mostra "Mesa não encontrada — confira o QR Code" em vez de quebrar.
3. Guarda `restaurantId`, `tableId`, `tableLabel` e `restaurantName` num React Context, disponível pro resto da árvore sem precisar re-buscar em cada componente.

A URL raiz sem token (`/`) mostra "Acesse pelo QR Code da sua mesa" — não existe cardápio genérico fora do contexto de uma mesa, porque o pedido sempre precisa saber pra onde vai.

### Cardápio

Categorias e produtos vêm direto de `categories`/`products` filtrados pelo `restaurantId` da mesa (`useMenu`), agrupados por categoria — os mesmos dados que o dono cadastra em `restaurante/Cardápio`, sem etapa de sincronização. Produtos inativos (`active = false`) nunca aparecem pro cliente.

### Carrinho

100% client-side até a confirmação — nenhuma escrita no banco enquanto o cliente está só montando o pedido. Persistido em `localStorage` com chave por mesa (`sigma:cart:<tableId>`), porque o login (próximo passo) faz um redirect de página inteira e o carrinho em memória se perderia nessa ida e volta.

### Confirmar pedido — login só no fim

O cliente navega e monta o carrinho **sem login**. Só ao clicar "Confirmar pedido":

- Se não há sessão: salva uma flag (`sigma:pending-order:<tableId>`) e dispara `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: <mesma URL da mesa> })`. Ao voltar do Google, a mesa é resolvida de novo pela URL, o carrinho volta do `localStorage`, e o pedido é enviado automaticamente (a flag pendente é detectada no carregamento da página).
- Se já há sessão: envia direto.

Não existe tela de cadastro separada — o próprio login do Google serve pra primeira vez e pra retorno, e o trigger `handle_new_user` já cria o `profile` `customer` automaticamente.

### Envio do pedido — Edge Function `place-dine-in-order`

O carrinho nunca vira `INSERT` direto do navegador, por dois motivos: `table_sessions` só é gravável por staff/admin via RLS, e o preço **nunca pode vir do cliente** (um preço adulterado no payload precisa ser ignorado). A function, rodando com a service role:

1. Recebe `{ table_id, items: [{ product_id, quantity }] }`.
2. Confere que cada `product_id` pertence de fato ao restaurante da mesa e está ativo — IDs forjados ou de outro tenant são rejeitados (`400`, lista de IDs inválidos).
3. Recalcula `unit_price` a partir de `products.price` no banco, ignorando qualquer preço enviado no corpo da requisição.
4. Abre uma comanda (`table_sessions`) ou reaproveita a já aberta daquela mesa — um índice único parcial (`table_sessions_one_open_per_table`, só onde `status = 'open'`) garante que dois pedidos quase simultâneos não criem duas comandas; a function trata o conflito de unicidade (`23505`) buscando a sessão existente em vez de falhar.
5. Grava `orders` (`order_type: 'dine_in'`, `status: 'received'`, `payment_status: 'pending'`) e os `order_items`.
6. Atualiza `restaurants.last_order_at`.

Exige um JWT válido (`verify_jwt: true`) — só usuário autenticado chega até aqui, reforçando a regra "login só na confirmação".

---

## 2. Painel do restaurante (`restaurante/`, porta 5175)

Onde o dono/equipe do restaurante gerencia o próprio negócio. Todo acesso é protegido por `ProtectedRoute` + RLS: um dono só enxerga dados do seu `restaurant_id`.

### Entrada — Cadastro, Login, Bem-vindo

O restaurante nunca se cadastra sozinho do zero: o admin cria o tenant e gera um `invite_token`. O dono recebe o link, abre `/cadastro`, e o `check-invite` (function pública) valida o token sem expor dados do restaurante. Ao escolher e-mail/senha, `complete-invite` cria a conta e o `handle_new_user` já vincula o `profile` ao restaurante certo, numa única operação atômica — não passa pelo caminho de `UPDATE` que o trigger anti-escalação bloquearia. Depois do cadastro, `/bem-vindo` dá as boas-vindas antes de cair no painel de verdade. `/login` é e-mail/senha padrão, redireciona pra `/dashboard`.

### Dashboard (`/dashboard`)

KPIs do dia, sempre "hoje" (não dependem de filtro de período):

- **Faturamento do dia** — soma de `orders.total` de hoje, excluindo cancelados.
- **Ticket médio do dia** — faturamento do dia ÷ número de pedidos não cancelados.
- **Pedidos totais / Pendentes / Entregues** — contagem por `orders.status` (pendente = `received`/`preparing`/`ready`; entregue = `completed`).
- **Canal do pedido** — três cards contando `order_type`: Mesa (`dine_in`), Delivery, Retirada (`pickup`). Hoje só o canal Mesa tem fluxo de pedido implementado ponta a ponta (item 1 acima); Delivery/Retirada existem no schema e nos cards, prontos pra quando esses canais forem construídos.

Abaixo, um gráfico de vendas por dia com seletor **Semana/Mês**, desenhado em SVG medindo o container real (via `ResizeObserver`) — sem distorção de proporção — com linhas de grade, valores no eixo Y e rótulos de dia da semana (visão semana) ou dia do mês (visão mês) embaixo de cada barra. Junto: unidades vendidas no período, e dois cards de **CMV** e **Lucro/Prejuízo** marcados como "requer ficha técnica" — decisão consciente de não inventar números sem um modelo de custo de insumos ainda cadastrado.

### Cardápio (`/cardapio`)

CRUD completo de categorias e produtos:

- Categorias: criar, editar nome/imagem, reordenar (setas, persistido em `sort_order`), excluir (produtos da categoria excluída caem em "sem categoria", nunca são apagados junto).
- Produtos: nome, descrição, preço, preço original (pra mostrar desconto), tempo de preparo, marcação "mais pedido", ativo/inativo, reordenar dentro da categoria.
- Upload de imagem real pro Supabase Storage (bucket `menu-images`, público pra leitura), em `{restaurant_id}/{categories|products}/{uuid}.{ext}` — a policy de escrita restringe cada tenant à própria pasta (`storage.foldername(name)[1] = current_restaurant_id()`), então um dono não consegue escrever na pasta de outro restaurante mesmo manipulando a chamada direto. Trocar a imagem apaga a antiga só depois que a nova sobe com sucesso, pra nunca ficar sem imagem no meio do caminho.

O que é cadastrado aqui aparece **imediatamente** no cardápio real do cliente (`/mesa/:token`) — é a mesma tabela, sem etapa de publicação.

### Mesas (`/mesas`)

Onde a comanda aberta por um cliente (via QR Code) chega pro garçom:

- Lista as `table_sessions` com `status = 'open'` do restaurante, com o nome da mesa, todos os itens pedidos (de todos os pedidos daquela sessão) e o total.
- Botão **"Fechar conta"**: marca todos os pedidos da sessão como `completed`/`paid` e fecha a comanda (`table_sessions.status = 'closed'`, `closed_at`, `total_charged`).

---

## 3. Painel da agência (`admin/`, porta 5174)

Onde a Sigma gerencia a carteira de restaurantes clientes. Só `role = 'admin'` entra — `ProtectedRoute` bloqueia com "Acesso não autorizado" pra qualquer outro papel.

### Dashboard (`/dashboard`)

Visão agregada de **todos** os tenants: quantos restaurantes ativos/total, unidades vendidas, faturamento total (só pedidos pagos), e ranking dos top 5 restaurantes por faturamento.

### Kanban (`/kanban`)

Pipeline de onboarding em colunas — `onboarding → active → suspended → cancelled`. Mover um restaurante de coluna chama a Edge Function `admin-set-account-status`, que atualiza o status e grava uma linha em `admin_action_log`.

### Restaurantes (`/restaurantes`)

Listagem com busca (nome/contato/e-mail) e:

- **Novo restaurante (convite)** — `admin-create-restaurant` sem senha: cria o tenant com um `invite_token` e devolve o link pra agência copiar e mandar pro dono. Onboarding sem fricção — a agência não precisa saber a senha de ninguém.
- **Adicionar manualmente** — mesma function, mas com `owner_password`: cria o tenant e a conta do dono já prontos, pra quando a agência já tem os dados na mão (é assim que a conta de demonstração existe).
- **Editar dados do restaurante** — `UPDATE` direto, coberto por RLS de admin.
- **Editar dono** — `admin-manage-owner` (ver/editar e-mail, nome, telefone) e um botão que gera link de redefinição de senha via `admin-reset-password` (o link precisa ser copiado e enviado manualmente — o projeto ainda não tem SMTP configurado pra e-mail transacional automático).

### Pedidos (`/pedidos`)

Visão somente-leitura de todos os pedidos de todos os restaurantes, com busca por nome do tenant e filtro por status. Deliberadamente sem edição — mudar o status de um pedido é responsabilidade do restaurante, não da agência.

### Auditoria (`/auditoria`)

As últimas 200 linhas de `admin_action_log` (com o nome do restaurante já resolvido via join, não o UUID cru), com busca por ação ou restaurante e detalhes formatados como "chave: valor" em vez de JSON cru. Toda mutação privilegiada feita por qualquer Edge Function `admin-*` grava aqui — é o rastro de tudo que a agência faz nas contas dos clientes.

---

## 4. Backend Supabase — peças que sustentam tudo

**Edge Functions ativas** (Deno, todas atrás de `_shared/admin-guard.ts` ou `_shared/customer-guard.ts`, que validam o JWT e devolvem um client de service role só depois de confirmar quem está chamando):

| Function | Quem chama | `verify_jwt` |
|---|---|---|
| `admin-create-restaurant` | admin | sim |
| `admin-manage-owner` | admin | sim |
| `admin-reset-password` | admin | sim |
| `admin-set-account-status` | admin | sim |
| `check-invite` | público (tela de cadastro) | não |
| `complete-invite` | público (tela de cadastro) | não |
| `place-dine-in-order` | cliente autenticado | sim |

**Storage**: bucket `menu-images` (público pra leitura, escrita restrita por pasta de tenant).

**RLS**: toda tabela de negócio (`restaurants`, `categories`, `products`, `tables`, `table_sessions`, `orders`, `order_items`, `admin_action_log`) tem policies baseadas em `current_app_role()`/`current_restaurant_id()` — nunca subquery inline repetida, pra evitar policies divergentes entre tabelas.

---

## Fora de escopo hoje (decisão, não esquecimento)

- **Retirada e Delivery** — os tipos existem no schema e nos KPIs do Dashboard, mas não têm fluxo de pedido implementado (dependem de decisão de gateway de pagamento, ainda em aberto).
- **Gestão de mesas pela UI do restaurante** — criar/editar mesa e gerar/imprimir QR Code ainda é feito só via banco; a mesa de demonstração foi criada manualmente.
- **Histórico de pedidos fechados** em `restaurante/Mesas` — a tela só mostra comandas abertas; não há tela de "vendas do dia" por comanda já fechada (os números agregados existem no Dashboard).
- **Atualização em tempo real de `/mesas`** — hoje é preciso recarregar a página pra ver um pedido novo chegar; não há polling nem Supabase Realtime ligado ainda.
- **CMV / Lucro** — precisa de um modelo de ficha técnica (custo de insumo por produto) que ainda não existe.
- **App do garçom, KDS, comanda impressa, NFC-e** — fora do escopo desta fase do produto.

## Login de demonstração

- **Admin**: acesso interno da agência (painel `admin/`).
- **Restaurante demo**: `agenciasigmaa+demo@gmail.com` / `SigmaDemo2026!`, restaurante "Restaurante Demo Sigma", status `active`, com cardápio populado (categorias e produtos com fotos reais enviadas pro Storage) e mesa de teste com QR Code funcional em `/mesa/:token`.
