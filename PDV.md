# PDV Agência Sigma — Como o sistema funciona

Relatório técnico do que está construído e funcionando hoje, tela por tela, com a peça de backend que sustenta cada uma. O sistema é composto por **três aplicações independentes** (Vite + React 19 + TypeScript + Tailwind v4) que compartilham **um único backend Supabase** (Postgres + Auth + Storage + Edge Functions), mais **um agente nativo em Go** que roda no computador do restaurante só pra imprimir comandas. Não existe API própria: cada app fala direto com o Supabase, e a autorização é garantida por Row Level Security (RLS) no banco — não por lógica de frontend.

## Modelo de dados e papéis

Uma agência (**ADM**) gerencia vários restaurantes (**tenants**). Cada restaurante tem seu próprio cardápio e board de pedidos, isolados dos demais pelo `restaurant_id`. Todo usuário autenticado tem um `profile` com um papel (`role`):

- **`admin`** — time da agência, acessa o painel `admin/`, enxerga todos os tenants.
- **`restaurant_owner` / `restaurant_staff`** — equipe do restaurante, acessa `restaurante/`, só enxerga o próprio tenant.
- **`customer`** — cliente final, criado automaticamente por um trigger (`handle_new_user`) em qualquer cadastro (e-mail/senha ou Google) — é assim que o cliente do cardápio público entra, ver seção 1. Nunca é atribuído manualmente.

Ninguém sobe de papel sozinho: `restaurant_owner` só nasce pelo fluxo de convite do admin, e `admin` não é auto-atribuível — isso é garantido por RLS e por um trigger (`prevent_role_escalation`) que bloqueia `UPDATE` em `profiles.role` fora dos caminhos controlados.

Toda leitura e escrita passa por policies de RLS baseadas em duas funções auxiliares (`current_app_role()`, `current_restaurant_id()`), que leem o perfil do usuário logado sem recursão. `categories`, `products` e (parcialmente) `restaurants` são públicas para leitura — o cardápio precisa aparecer pra quem não está logado.

---

## 1. Cardápio do cliente final (app raiz, porta 5173)

Onde o cliente faz o pedido, sem precisar criar conta. O ponto de entrada é **por restaurante, não por mesa**: `/loja/:restaurantId`. Não existe mais QR Code por mesa física com token único — a URL raiz sem `restaurantId` (`/`) mostra uma tela genérica "Acesse pelo QR Code da sua mesa", já que o QR Code impresso na mesa aponta direto pro link do restaurante.

### Abrindo o cardápio

Ao abrir `/loja/:restaurantId`, o app resolve o restaurante e a marca dele (`restaurant_branding`) num contexto React único, carrega categorias/produtos ativos (`useMenu`) e monta a tela em cima disso. Se o `restaurantId` não existir, mostra "Restaurante não encontrado" em vez de quebrar.

**Identidade visual do restaurante** é aplicada em três pontos, lidos de `restaurant_branding`: a cor principal vira uma variável CSS global (`--color-primary`) que colore todo botão/destaque da tela; o favicon e o título da aba trocam pro do restaurante; e a logo aparece no cabeçalho (ou um quadrado com a inicial do nome, se não houver logo).

### Navegando o cardápio

No topo, um **carrossel de banners promocionais** (se o restaurante tiver algum cadastrado) — imagem cheia com gradiente, título, subtítulo opcional e botão; tocar num banner rola a tela até a categoria vinculada a ele, se houver. Abaixo, uma faixa horizontal de categorias funciona como âncora de navegação rápida. Cada produto aparece num card com imagem, nome, descrição, preço (com preço "de/por" riscado se estiver em promoção), selo de "Mais pedido" quando marcado, tempo de preparo, e — se for um combo — a lista do que está incluso. Produto marcado como esgotado no dia mostra um selo cinza "Esgotado" no lugar do botão de adicionar, sem chance de pedir.

### Personalizando um item

Produtos simples ganham um botão de +/− direto no card. Se a categoria do produto permite meio a meio (e tem pelo menos outro produto pra combinar), tocar no card não abre a folha de personalização direto — primeiro pergunta **"inteira ou meio a meio?"**: escolhendo inteira, segue pro normal; escolhendo meio a meio, mostra a lista de outros produtos da mesma categoria (nunca o próprio item tocado — meio a meio do mesmo sabor duas vezes não faz sentido) pra escolher o segundo sabor antes de abrir a folha, já com esse sabor marcado.

Produtos que exigem alguma escolha (adicional, meio a meio, "escolha seu X" de um combo, ou ingrediente removível) abrem uma folha de personalização com, nesta ordem:

- **Meio a meio** (quando a categoria permite): metade de um sabor, metade de outro produto da mesma categoria — o preço final é calculado pela regra da categoria (o mais caro dos dois, ou a média). Continua editável aqui mesmo depois de escolhido no popup inicial, caso a pessoa mude de ideia sobre o sabor.
- **Grupos de escolha de combo** ("escolha seu hambúrguer"): uma opção obrigatória por grupo, sem alterar o preço.
- **Grupos de adicionais**: com ou sem quantidade por adicional, marcados como obrigatórios quando o restaurante exige pelo menos um.
- **Remover ingredientes**: toggle por ingrediente, sem efeito no preço.

O botão de confirmar só libera quando toda escolha obrigatória foi feita — se faltar algo, aparece qual grupo ainda precisa de seleção.

### Carrinho, cadastro e confirmação

O carrinho é 100% local (guardado por restaurante) até o cliente confirmar de verdade. **Tocar no ícone da sacola já pede login se ainda não tiver conta real** — não só na hora de confirmar: montar o pedido todo pra só pedir login no fim faria a plataforma perder o lead inteiro se a pessoa desistisse antes desse último passo, então o cadastro/login (nome/e-mail/senha/telefone, ou "Continuar com Google") acontece assim que a sacola é aberta. A tela de login/cadastro abre por padrão na aba de quem **já tem conta**, com "Criar cadastro" ao lado — a maioria de quem toca no ícone de conta já é cliente de antes, não gente nova. **Telefone é obrigatório pra confirmar o pedido, não só um campo do formulário**: quem entrou com e-mail/senha já preencheu na hora do cadastro, mas quem entrou com Google (que nunca traz telefone) é bloqueado na hora de confirmar e mandado pra tela de perfil até completar — o pedido é retomado sozinho assim que salva. A partir do login o **nome já vem preenchido** do perfil (ainda dá pra editar, ex. pedindo pra outra pessoa na mesma mesa) e, se o cliente já tiver um endereço salvo, o carrinho de delivery abre direto no resumo compacto desse endereço (ícone + "Trocar") em vez de forçar escolher de novo — e se aquele mesmo endereço já foi usado nesse restaurante antes, o **bairro também vem pré-selecionado**, lembrado do pedido anterior. **Forma de pagamento (com opção de troco pra dinheiro) é perguntada pra mesa também, não só delivery** — antes só aparecia no fluxo de entrega.

Ao tocar em "Revisar pedido":

1. O app confere se algum preço mudou desde que o item entrou no carrinho (reconsulta o banco). Se mudou, ou se algum produto saiu do ar, mostra um aviso com o que mudou antes de deixar enviar — o cliente decide se revê o carrinho ou segue com os valores atualizados.
2. Sem mudança de preço, abre uma tela de **revisão** (resumo só de leitura: itens, mesa/endereço, pagamento, cliente, total, e "Economia de R$ X" quando algum item está em promoção) com "Voltar" pra editar ou "Confirmar pedido" pra enviar de verdade.
3. O pedido é enviado pra Edge Function `place-dine-in-order`.
4. Sucesso mostra uma tela cheia de confirmação ("Pedido enviado!"); falha mostra o erro dentro do próprio carrinho, que continua aberto pra tentar de novo.

O ícone de conta no topo do cardápio (e o ícone de prancheta ao lado, só pra quem já tem conta real) abrem a mesma tela cheia **"Minha conta"**, cada um numa aba diferente — não são mais dois painéis separados. No celular a navegação é uma barra de abas no topo (Perfil | Pedido); no desktop vira um menu lateral fixo, com "Sair" no rodapé. Trocar de aba não fecha e reabre a tela, só troca o conteúdo do lado.

- **Meu perfil**: nome, telefone, trocar senha, e endereços de entrega salvos (cada um com um nome escolhido pelo cliente, tipo "Casa"/"Trabalho", com o ícone correspondente) — que também dá pra nomear direto no checkout, na hora de digitar um endereço novo. Sem foto de perfil. O cadastro vale em qualquer restaurante da plataforma (não é por tenant). **Login normal nunca abre essa tela sozinho** — só fecha o popup de login e volta pro cardápio; só um cadastro novo sem telefone (ou um pedido bloqueado por falta de telefone, ver acima) abre automaticamente, com um aviso explicando o porquê.
- **Meu pedido**: no topo, o andamento do pedido mais recente feito *nessa loja*, em tempo real, com um passo a passo diferente por canal — "Recebido → Em preparo → Pronto → Entregue" pra mesa, "…→ Pronto pra retirar → Retirado" pra retirada (mostra o código de retirada em destaque), "…→ Saiu pra entrega → Entregue" pra delivery (mostra endereço e bairro). Um ponto no ícone avisa quando há pedido em andamento, sem precisar abrir. É diferente da tela cheia "Pedido enviado!" que aparece uma vez só, na hora da confirmação — essa tela fica disponível o tempo todo depois, pra conferir o status sem precisar recarregar a página. Abaixo do pedido atual, um **histórico** lista os pedidos anteriores nessa loja (data, canal, total, status) — inclusive os que já saíram do rastreio "em andamento" por estarem concluídos/cancelados há um tempo.

### Envio do pedido — Edge Function `place-dine-in-order`

O carrinho nunca vira `INSERT` direto do navegador — o preço **nunca pode vir do cliente**. A function, rodando com a service role:

1. Recebe o pedido inteiro: produto, quantidade, adicionais, sabor de meio a meio, escolhas de combo e ingredientes removidos.
2. Recalcula cada preço a partir do banco (produto, adicional, meio a meio pela mesma fórmula do frontend, validade de cada escolha de combo e de cada ingrediente removível) — nada do que o cliente mandou é usado pra cobrar.
3. Grava `orders` (`order_type: 'dine_in'`, `status: 'received'`, `payment_status: 'pending'`) e todos os relacionamentos de item.

Exige um JWT válido (`verify_jwt: true`) — o cadastro/login do passo anterior é justamente pra isso. Essa mesma function também é o caminho usado pela equipe do restaurante pra lançar pedidos manuais de mesa, retirada e entrega (ver seção 2), e é o que o próprio cliente usa pra pedir mesa, retirada ou entrega direto pelo cardápio público.

---

## 2. Painel do restaurante (`restaurante/`, porta 5175)

Onde o dono/equipe do restaurante gerencia o próprio negócio. Todo acesso é protegido por `ProtectedRoute` + RLS: um dono só enxerga dados do seu `restaurant_id`.

### Entrada — Cadastro, Login, Bem-vindo

O restaurante nunca se cadastra sozinho do zero: o admin cria o tenant e gera um `invite_token`. O dono recebe o link, abre `/cadastro`, e o `check-invite` (function pública) valida o token sem expor dados do restaurante — link inválido ou expirado mostra um aviso e nenhum formulário. Token válido libera um formulário simples (e-mail, senha, confirmar senha); `complete-invite` cria a conta e o `handle_new_user` já vincula o `profile` ao restaurante certo numa única operação atômica. Depois do cadastro, `/bem-vindo` dá as boas-vindas uma única vez (não é um checklist de onboarding persistente) antes de a pessoa navegar pro painel de verdade pelo menu. `/login` é e-mail/senha padrão, redireciona pra `/dashboard`.

### Dashboard (`/dashboard`)

Dois seletores de período independentes: um pros KPIs (Hoje / Ontem / 7 dias / Este mês / Personalizado, com intervalo de datas) e outro só pro gráfico de vendas por dia (Semana / Mês).

- **KPIs**: Faturamento, Ticket médio, Pedidos totais, Pendentes, Entregues, Cancelados.
- **Canais**: três cards (Mesa / Delivery / Retirada), cada um com pedidos, faturamento e ticket médio do canal.
- **Gráfico de vendas por dia**: barra por dia desenhada em SVG próprio (sem lib de gráfico), com tooltip ao passar o mouse, eixo com valores em R$ e rótulos por dia da semana ou dia do mês conforme o período escolhido.
- **Produtos mais vendidos**: top 5 por quantidade no período, com barra proporcional.
- **Horário de pico**: 24 barras, uma por hora do dia, com o pico destacado.
- **Unidades vendidas / CMV / Lucro-Prejuízo**: CMV e Lucro **são reais hoje**, não um placeholder — vêm de uma ficha técnica por produto (ver Cardápio → Produto abaixo). O CMV do período é a soma, por item vendido, de quantidade × custo de cada ingrediente da receita daquele produto; Lucro é faturamento menos esse CMV. Produto sem ficha técnica cadastrada simplesmente entra com CMV zero, sem aviso na tela — a precisão desse número depende de o dono ter preenchido a receita de cada prato.

### Cardápio (`/cardapio`)

Cinco abas: **Produtos**, **Categorias**, **Simulador**, **Aparência**, **Banners** — mais um link "Ver como o cliente vê".

**Produtos** — busca, filtro por categoria, alternância lista/grade, reordenação por arrastar-e-soltar (desligada enquanto há busca/filtro ativo). Cada produto mostra imagem, preço (com desconto se houver), tempo de preparo, um selo "Mais pedido" que liga/desliga com um toque, um toggle Ativo/Inativo, e um toggle "Esgotado hoje" — o 86 rápido do dia a dia, sem precisar editar o produto. Duplicar um produto copia a ficha técnica junto.

Abrir um produto pra editar mostra: **carrossel de imagens** (várias fotos, reordenáveis), nome, descrição, categoria, preço de venda, preço original opcional (pra mostrar "de/por"), tempo de preparo, **ficha técnica** (adiciona ingredientes com autocomplete do catálogo do restaurante — ou cadastra um novo na hora, informando quanto custou por unidade —, e calcula CMV e margem em tempo real conforme a receita é montada), **itens do combo** (composição fixa, só informativo — não some no preço), **grupos de escolha** (a mesma engrenagem de "escolha seu X" que o cliente vê), e os toggles de Ativo/Mais pedido.

**Categorias** — reordenação, um toggle "Permite montar meio a meio" com a regra de preço (mais caro dos dois ou média), um botão "Adicionais" que abre os grupos de adicionais daquela categoria inteira (com a opção "obrigatório" por grupo), e duplicar (copia produtos, ficha técnica e adicionais junto).

**Simulador** — ferramenta de "e se": monta um produto hipotético com ficha técnica e preço-alvo, mostra CMV/lucro/margem antes de esse produto sequer existir no cardápio. "Adicionar ao cardápio" leva o rascunho direto pro formulário de produto de verdade.

**Aparência** — nome exibido ao cliente, logo, favicon, cor principal (paleta de predefinidas + seletor livre). É o que alimenta o `restaurant_branding` que a seção 1 descreve.

**Banners** — CRUD do carrossel de promoções do cardápio público: imagem, título, subtítulo, texto do botão, categoria de destino opcional, ativo/inativo, reordenação. Sem nenhum banner ativo, o carrossel simplesmente não aparece pro cliente.

O que é cadastrado aqui aparece **imediatamente** no cardápio real do cliente — é a mesma tabela, sem etapa de publicação.

### Pedidos (`/pedidos`)

Board Kanban em tempo real: Recebido → Em preparo → Pronto → Entregue, mais uma coluna Cancelado. Cada coluna mostra a contagem e o total em R$; filtro por canal (Mesa/Retirada/Entrega) e busca por cliente/mesa.

Cada card mostra o canal, há quanto tempo o pedido chegou, o cliente, onde entregar (mesa/código de retirada/endereço), os itens (com adicionais, escolhas de combo e ingredientes removidos destacados), o total, e quatro ações: avançar status, ver detalhes, reimprimir a comanda, cancelar. Um pedido parado no mesmo status por 15 minutos ganha um aviso âmbar; por 30 minutos, vermelho — sem precisar abrir nada pra notar que algo travou.

**"Novo pedido"** abre um formulário pra equipe lançar um pedido manual (telefone, balcão) — hoje só produto + quantidade, sem adicional/combo/meio a meio. O tipo (Mesa/Retirada/Entrega) muda os campos exigidos; retirada gera um código mostrado em tela cheia pra passar pro cliente. Se o cliente que ligou já tem conta e já pediu antes nesse restaurante, dá pra linkar o pedido à conta dele num dropdown (assim ele aparece no histórico da conta, igual um pedido feito pelo cardápio) — clientes de primeira viagem ou com conta só de outro restaurante não aparecem nessa lista, o pedido fica sem cliente vinculado nesse caso, igual sempre foi.

Numa entrega, a hora de escolher o motoboy é quando o pedido passa pra **Pronto** — em vez de um campo solto no card, aparece um popup perguntando quem vai assumir a entrega, e só marca como pronto depois de escolher.

O ícone de detalhes abre um painel onde a equipe pode adicionar/remover item, editar desconto e taxa de serviço (sempre recalculados do zero a partir do banco, nunca incrementalmente — via a Edge Function `staff-edit-order`), registrar a forma de pagamento (dinheiro/cartão/PIX) e escrever uma observação do pedido. Cada pedido novo toca um som diferente conforme o canal.

**"Informar alta demanda"**, ao lado de "Novo pedido", abre um ajuste temporário de tempo e taxa de entrega — inspirado no recurso equivalente do iFood. A equipe escolhe minutos extras, uma taxa extra em R$, um motivo (motoboy faltou, chuva, cozinheiro faltou, alta demanda, outro) e por quanto tempo o ajuste vale (1 a 6 horas); ele expira sozinho, sem precisar lembrar de desligar. Enquanto ativo, o botão vira um aviso "Alta demanda até HH:MM" clicável pra editar ou remover antes da hora. A taxa extra soma na taxa do bairro em todo pedido de entrega novo enquanto o ajuste estiver valendo (recalculada no servidor, nunca confiada do navegador do cliente) — mas não aparece explicada pro cliente no checkout, só no valor final do pedido.

### Marketing (`/marketing`)

Duas coisas, sem depender uma da outra: um campo pra colar o **ID do Pixel do Meta** (Facebook/Instagram Ads) — assim que salvo, o cardápio público desse restaurante carrega o pixel e avisa o Meta em dois momentos: quando o cliente toca "Revisar pedido" (sinal de que está prestes a comprar) e quando o pedido é realmente confirmado (a venda em si), pra otimizar o anúncio pra quem compra, não só quem visita a página; e um **gerador de link**, com dois usos: "Tráfego pago" gera um link que abre o cardápio já no fluxo de delivery, sem perguntar "como você quer receber?" — bom pra colar no anúncio; "Mesa" gera um link com o número da mesa preenchido, bom pra colar num adesivo/QR code físico da mesa.

### Impressora (`/impressora`)

Configuração do **agente de impressão local** (ver seção 5): detecta se o agente está rodando na máquina, oferece o instalador pra baixar direto da tela, permite escolher a impressora/largura do papel/número de cópias, ligar a impressão automática, e imprimir uma página de teste.

---

## 3. Painel da agência (`admin/`, porta 5174)

Onde a Sigma gerencia a carteira de restaurantes clientes. Só `role = 'admin'` entra — `ProtectedRoute` bloqueia com "Acesso não autorizado" pra qualquer outro papel.

### Dashboard (`/dashboard`)

Duas fileiras de cards, sem gráfico — tudo em números e lista. A primeira: quantos restaurantes ativos/total, unidades vendidas, faturamento total (só pedidos pagos). A segunda: quantos restaurantes em cada estágio do funil (Onboarding / Ativo / Suporte-Risco / Inativo) — um resumo numérico do Kanban direto no Dashboard. Abaixo, o ranking dos top 5 restaurantes por faturamento.

### Kanban (`/kanban`)

Pipeline de onboarding em colunas — Onboarding → Ativo → Suporte/Risco → Inativo. Não é arrastar-e-soltar: cada card tem um botão "Mover para {próximo estágio}", que só avança pro próximo da sequência fixa (voltar ou pular estágio não dá pra fazer por aqui — só pela tabela de Restaurantes, ver abaixo). Mover chama a Edge Function `admin-set-account-status`, que atualiza o status e grava uma linha em `admin_action_log`.

### Restaurantes (`/restaurantes`)

Listagem com busca (nome/contato/e-mail), coluna de "última atividade" (data do último pedido do tenant), e uma coluna de status que é um `<select>` editável — diferente do Kanban, aqui dá pra pular pra qualquer estágio direto, não só avançar. Ações:

- **Novo restaurante (convite)** — `admin-create-restaurant` sem senha: cria o tenant com um `invite_token` e devolve o link pra agência copiar e mandar pro dono. Onboarding sem fricção — a agência não precisa saber a senha de ninguém. Atalho disponível também na barra lateral, sempre visível.
- **Adicionar manualmente** — mesma function, mas com senha do dono: cria o tenant e a conta já prontos, pra quando a agência já tem os dados na mão (é assim que a conta de demonstração existe).
- **Editar dados do restaurante** — `UPDATE` direto, coberto por RLS de admin.
- **Editar dono** — `admin-manage-owner` (ver/editar e-mail, nome, telefone) e um botão que gera link de redefinição de senha via `admin-reset-password` (o link precisa ser copiado e enviado manualmente — o projeto ainda não tem SMTP configurado pra e-mail transacional automático).

### Pedidos (`/pedidos`)

Visão somente-leitura dos 200 pedidos mais recentes de todos os restaurantes, com busca por nome do tenant e filtro por status. Sem filtro de período. Deliberadamente sem edição — mudar o status de um pedido é responsabilidade do restaurante, não da agência.

### Auditoria (`/auditoria`)

As últimas 200 linhas de `admin_action_log` (com o nome do restaurante já resolvido via join, não o UUID cru), com busca por ação ou restaurante e detalhes formatados como "chave: valor" (valores aninhados caem pra JSON cru quando não dá pra achatar). Toda mutação privilegiada feita por qualquer Edge Function `admin-*` grava aqui — é o rastro de tudo que a agência faz nas contas dos clientes.

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
| `place-dine-in-order` | cliente (cadastro real) ou equipe do restaurante | sim |
| `staff-edit-order` | equipe do restaurante | sim |

**Storage**: bucket `menu-images` (público pra leitura, escrita restrita por pasta de tenant) — guarda imagens de produto, categoria, marca (logo/favicon) e banners promocionais.

**RLS**: toda tabela de negócio (`restaurants`, `categories`, `products`, `addon_groups`/`addons`, `combo_items`, `combo_choice_groups`/`combo_choice_options`, `ingredients`/`product_ingredients`, `promo_banners`, `restaurant_branding`, `orders`, `order_items` e as tabelas de detalhe do item — adicionais, escolhas de combo, ingredientes removidos —, `admin_action_log`) tem policies baseadas em `current_app_role()`/`current_restaurant_id()` — nunca subquery inline repetida, pra evitar policies divergentes entre tabelas.

---

## 5. Agente de impressão local

Comanda impressa automaticamente na cozinha, sem ninguém precisar clicar em nada — esse é o problema que o **agente de impressão** resolve, e é a quarta peça do sistema, ao lado dos três apps web. É um programa nativo (Go), sem Java, sem instalador pesado, que fica rodando no computador do restaurante e conversa com o navegador direto em `127.0.0.1`, sem passar pela internet.

Pro dono do restaurante, a experiência é: baixar o instalador direto da tela **Impressora** do painel (`/impressora`), rodar uma vez, e pronto — ele aparece com um ícone na bandeja do Windows, já configurado pra abrir sozinho a cada login. Dali, é só escolher a impressora e a largura do papel.

Depois de configurado, toda comanda que chega imprime sozinha — e isso funciona **em qualquer tela do painel**, não só com a tela de Pedidos aberta: o dono pode estar mexendo no Cardápio ou olhando o Dashboard que a comanda sai do mesmo jeito. Também dá pra reimprimir manualmente qualquer pedido a partir do board de Pedidos, se o papel travar ou a comanda se perder.

Limitação atual, por escolha: o agente só imprime cupom térmico (ESC/POS) — não existe caminho pra imprimir PDF/A4 (relatórios, notas) nesta fase.

Detalhe técnico completo (arquitetura, API, instalação, histórico das tentativas anteriores que não deram certo) está em `agente/README.md` e em `CLAUDE.md`.

---

## Fora de escopo hoje (decisão, não esquecimento)

- **Retirada e Delivery pelo próprio cliente** — o cardápio público (seção 1) só produz pedidos de mesa; retirada e entrega hoje só existem quando a equipe do restaurante lança manualmente pela tela Pedidos. Falta decidir o fluxo de pagamento antes de abrir esses canais pro cliente final.
- **Adicional, combo e meio a meio em pedido manual** — o formulário de "Novo pedido" da equipe só aceita produto + quantidade por enquanto; essas personalizações só existem no cardápio público.
- **Gateway de pagamento online** — nenhum pedido é cobrado automaticamente no ato; o pagamento é sempre registrado manualmente pela equipe (dinheiro/cartão/PIX) depois que o pedido chega.
- **E-mail transacional automático** — convite de restaurante e redefinição de senha geram um link que a agência precisa copiar e enviar na mão; não há SMTP configurado.
- **Impressão de PDF/A4** — o agente de impressão local (seção 5) só imprime cupom térmico ESC/POS.
- **App do garçom dedicado, KDS, NFC-e** — fora do escopo desta fase do produto.

## Login de demonstração

- **Admin**: acesso interno da agência (painel `admin/`).
- **Restaurante demo**: `agenciasigmaa+demo@gmail.com` / `SigmaDemo2026!`, restaurante "Restaurante Demo Sigma", status `active`, com cardápio populado (categorias e produtos com fotos reais enviadas pro Storage).
