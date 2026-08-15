# Como funciona a impressão de comandas

Este documento explica, de ponta a ponta, como uma comanda sai do pedido
criado no sistema até sair impressa na impressora térmica do restaurante.
Complementa o `printer-app/README.md` (que é o guia de build/uso do app
nativo) com a visão do fluxo completo, incluindo o lado do `restaurante/`.

## Visão geral

```
Pedido novo chega (realtime)          Botão "Imprimir" manual
        │                                      │
        └───────────────┬──────────────────────┘
                         ▼
        restaurante/src/lib/printing.tsx → printTicket(order)
                         │
      1. Renderiza <TicketPrintView order={order} /> dentro de uma
         div escondida (#print-ticket), com @page CSS aplicado pra
         largura de bobina escolhida (58/80/88mm).
      2. Espera um frame (requestAnimationFrame) pro React
         confirmar o novo conteúdo no DOM.
      3. Decide o caminho de impressão:
         ┌───────────────────────────┬─────────────────────────────┐
         │ Dentro do Sigma Impressão │ Navegador comum (sem o .exe) │
         │ (window.chrome.webview    │                              │
         │  existe)                  │                              │
         ├───────────────────────────┼─────────────────────────────┤
         │ postMessage               │ window.print()               │
         │ {"type":"print-ticket"}   │ (abre o diálogo padrão do    │
         │                           │  navegador — usado em dev e  │
         │                           │  no botão "Imprimir teste")  │
         └───────────────┬───────────┴──────────────┬───────────────┘
                          ▼                          ▼
              MainForm.cs (WebView2)          Diálogo do navegador
              OnWebMessageReceived                  │
                          │                          ▼
                          ▼                  Usuário confirma manualmente
              CoreWebView2.PrintAsync
              (impressora padrão do
               Windows, sem diálogo)
```

## As duas pontas

### 1. `restaurante/` (a página, React) — o que decide *o quê* imprimir

- **`restaurante/src/components/TicketPrintView.tsx`** — o layout da comanda
  em si (itens, adicionais, meio a meio, ingredientes removidos, notas,
  totais). Única fonte de verdade do conteúdo impresso — tanto o caminho
  automático quanto o manual usam o mesmo componente.
- **`restaurante/src/lib/printing.tsx`** — orquestra a impressão:
  - `getStoredPaperWidth()` / `setStoredPaperWidth()` — preferência de
    bobina (`localStorage`, por dispositivo, chave `sigma:paper-width`).
  - `getAutoPrintEnabled()` / `setAutoPrintEnabled()` — liga/desliga a
    impressão automática (`localStorage`, chave `sigma:auto-print`; **vem
    ligada por padrão**).
  - `printTicket(order)` — função central descrita no diagrama acima.
- **`restaurante/src/pages/Pedidos.tsx`** — chama `printTicket(order)`
  automaticamente (via `useEffect`) quando chega um pedido novo pelo
  realtime (`useIncomingOrders()`, `restaurante/src/lib/orders.ts`), desde
  que `getAutoPrintEnabled()` esteja true. Também expõe um botão manual de
  imprimir por card, pra reimprimir qualquer comanda a qualquer momento.
- **`restaurante/src/pages/ConfiguracaoImpressao.tsx`** — tela onde o
  funcionário liga/desliga impressão automática, escolhe a bobina, baixa o
  `.zip` do Sigma Impressão e testa a impressão (com um pedido de exemplo
  fixo, `SAMPLE_ORDER`).

**Importante**: nada disso fala com o Supabase pra imprimir. A impressão é
100% client-side — o Supabase só entrega o pedido via realtime; a partir
daí é tudo local, no navegador/WebView2.

### 2. `printer-app/` (o app nativo) — o que garante impressão *sem diálogo*

App WinForms + WebView2 mínimo (`SigmaPrintApp/`) que:

1. Abre em tela cheia carregando a própria página `restaurante/pedidos`
   (`Program.cs`, URL fixa `DefaultUrl`, sobrescrevível via variável de
   ambiente `SIGMA_URL` pra testes locais sem recompilar).
2. Faz login normal do Supabase, como qualquer outra sessão do
   `restaurante/` — **não tem credencial própria nem conhece
   `restaurant_id`**; o isolamento entre tenants vem inteiramente do RLS já
   existente, igual a qualquer outra tela do app.
3. `MainForm.cs` escuta mensagens `postMessage` vindas da página
   (`OnWebMessageReceived`). Ao receber `{"type":"print-ticket"}`, chama
   `CoreWebView2.PrintAsync` com margens zeradas na impressora **padrão do
   Windows** — sem diálogo de confirmação, sem escolher impressora na tela.

**Por que não QZ Tray / ESC-POS**: uma tentativa anterior usando QZ Tray
(bridge WebSocket + certificado assinado) foi revertida — o modelo de
confiança de certificado autoassinado do QZ Tray exige ou um certificado
pago da QZ Industries, ou instalar manualmente um `override.crt` na pasta
do QZ Tray pra parar de perguntar toda vez ("lembrar decisão" fica
desabilitado pra certificados não confiáveis, por design deles mesmos).
Isso é fricção demais pro funcionário do restaurante. `CoreWebView2.PrintAsync`
é uma API privilegiada disponível pra qualquer app que embute WebView2
nativamente — não precisa de certificado, assinatura, nem popup de
confiança nenhum.

**Por que não é self-contained**: build self-contained + single-file
(~65MB) estourava o limite de 50MB por arquivo do bucket público do
Supabase Storage no plano free. A build atual é *framework-dependent*
(~2MB) e depende do .NET 8 Desktop Runtime já instalado na máquina — se
faltar, o próprio Windows mostra o aviso oficial da Microsoft com o link de
download na primeira tentativa de abrir o `.exe` (mesmo padrão usado pra
WebView2 Runtime).

Ver `printer-app/README.md` pra build, publicação e o protocolo
`postMessage` em detalhe.

## Distribuição

- O `.zip` compilado fica hospedado no bucket público **`sigma-print-app`**
  do Supabase Storage (nome exato — já teve um bug de link quebrado por um
  mismatch de nome no passado, conferir sempre).
- O link de download vive em `ConfiguracaoImpressao.tsx`
  (`WRAPPER_DOWNLOAD_URL`), com um `?v=N` (`WRAPPER_DOWNLOAD_VERSION`) só
  pra evitar que o navegador do restaurante sirva um `.zip` velho do cache
  depois de uma republicação — **incrementar esse número sempre que subir
  um `.zip` novo**.
- Migration `supabase/migrations/0034_sigma_print_app_bucket_policies.sql`
  cria as policies de leitura/escrita do bucket.

## O que acontece sem o Sigma Impressão aberto

Se nenhuma janela/aba estiver com a tela **Pedidos** aberta e logada no
momento em que o pedido chega, nada imprime sozinho — o auto-print depende
de uma sessão realtime ativa ouvindo a tabela `orders` naquele instante.
Isso não é um bug: é o próprio design (sem backend/fila de impressão
nenhuma). Na prática, isso significa manter o `.exe` sempre aberto no PC
ligado na impressora (dá pra colocar um atalho na pasta de inicialização do
Windows — `Win+R` → `shell:startup`).

## Testando sem impressora térmica

O botão **"Imprimir teste"** na tela de Configuração de Impressão dispara
`printTicket(SAMPLE_ORDER)` com um pedido fake fixo — fora do Sigma
Impressão isso abre o diálogo normal do navegador (esperado, serve só pra
conferir o layout/CSS da bobina). Dentro do Sigma Impressão real, sai sem
diálogo direto na impressora padrão.

## Limitações conhecidas / não resolvidas

- O `DefaultUrl` em `printer-app/SigmaPrintApp/Program.cs` ainda aponta pro
  servidor de desenvolvimento local (`http://localhost:5175/pedidos`) —
  precisa ser atualizado pro domínio de produção assim que ele existir,
  antes de distribuir o `.exe` de verdade pros restaurantes.
- Não testado ainda em impressora térmica física real (só via fallback
  `window.print()` em navegador) — o caminho `CoreWebView2.PrintAsync`
  silencioso precisa de confirmação em máquina Windows real com impressora
  conectada.
