# Sigma Impressão

App nativo mínimo (WinForms + WebView2) que embute a tela **Pedidos** do
`restaurante/` numa janela única e imprime cada comanda automaticamente,
assim que ela chega, sem nenhum diálogo de confirmação — usando a API
nativa `CoreWebView2.PrintAsync`, não a flag de linha de comando
`--kiosk-printing`.

Não fala com o Supabase, não sabe o que é "restaurante", não escuta em
nenhuma porta e não tem segredo/chave de pareamento nenhuma — é só um shell
de navegador que carrega a página e, quando ela pede, manda imprimir na
impressora **padrão do Windows**. Isolamento entre tenants vem de a própria
página (com login normal do Supabase) já filtrar os dados por
`restaurant_id` via RLS, igual a qualquer outra tela do `restaurante/`.

## Pré-requisitos

- Windows 10/11.
- WebView2 Runtime — já vem instalado por padrão no Windows 11 e em qualquer
  Windows 10 com Edge atualizado; se faltar, o app mostra um aviso com o link
  de download na primeira abertura.
- **.NET 8 Desktop Runtime** — a build é *framework-dependent* (não
  self-contained), pra manter o `.zip` pequeno o suficiente pro bucket
  público do Supabase (limite de 50MB no plano free). Se não estiver
  instalado, o Windows mostra sozinho, na primeira tentativa de abrir o
  `.exe`, um aviso oficial da Microsoft com o link certo pra baixar — não é
  algo que a gente precisa construir na mão.
- Impressora térmica instalada como impressora do Windows (USB com driver,
  ou impressora de rede cadastrada por IP) e definida como **impressora
  padrão** — Configurações → Impressoras e scanners → escolher a térmica →
  "Definir como padrão".

## Uso (funcionário do restaurante)

1. Baixe o `.zip` (link fica na tela **Impressão** do sistema, dentro do app
   do restaurante) e extraia numa pasta qualquer (ex. Área de Trabalho).
2. Dê dois cliques em `sigma-print-app.exe`. Abre em tela cheia já na tela de
   login do Sigma PDV — faça login normalmente.
3. Deixe a janela aberta. Toda comanda nova sai sozinha na impressora padrão
   do Windows, sem precisar confirmar nada.

Pra abrir sozinho com o Windows: crie um atalho do `.exe` e cole na pasta de
inicialização (`Win+R` → `shell:startup` → colar o atalho lá).

## Build

Requer [.NET 8 SDK](https://dotnet.microsoft.com/download) — só na máquina
de quem gera o `.zip`, o restaurante nunca precisa instalar o SDK, só o
Runtime (ver pré-requisitos acima).

```bash
cd SigmaPrintApp
dotnet publish -c Release -r win-x64 --self-contained false
```

Gera os arquivos em `bin/Release/net8.0-windows/win-x64/publish/`
(`sigma-print-app.exe` + as DLLs do WebView2 — ~2MB no total). Zipe essa
pasta inteira (não só o `.exe` sozinho, ele depende das DLLs ao lado).

**Por que não self-contained**: já tentamos publicar self-contained +
single-file (não depende do .NET Runtime instalado) e o pacote final ficava
em ~65MB — acima do limite de 50MB por arquivo do bucket público do Supabase
no plano free. Framework-dependent gera ~2MB e cabe tranquilo, ao custo de
exigir o .NET 8 Desktop Runtime na máquina do restaurante (mitigado pelo
aviso automático do Windows, ver acima). Se um dia isso incomodar, dá pra
reconsiderar self-contained + trimming (`-p:PublishTrimmed=true`), mas isso
precisa ser testado numa máquina Windows de verdade antes de distribuir —
WinForms + WebView2 com trimming agressivo não é 100% garantido pela
Microsoft e não tem como validar isso rodando fora do Windows.

Pra testar contra o servidor de desenvolvimento (`npm run dev` em
`restaurante/`, porta 5175) sem recompilar, rode com a variável de ambiente
`SIGMA_URL`:

```powershell
$env:SIGMA_URL = "http://localhost:5175/pedidos"
.\bin\Release\net8.0-windows\win-x64\publish\sigma-print-app.exe
```

## Publicar uma nova versão

Zipe a pasta `bin/Release/net8.0-windows/win-x64/publish/` inteira como
`sigma-print-app.zip` e suba pro bucket público `sigma-print-app` do
Supabase Storage (dashboard → Storage → `sigma-print-app` → upload,
sobrescrevendo o arquivo `sigma-print-app.zip`) — o link na tela
**Impressão** do `restaurante/` (`restaurante/src/pages/ConfiguracaoImpressao.tsx`,
constante `WRAPPER_DOWNLOAD_URL`) já aponta pra esse bucket/arquivo exatos;
**confira que o nome do bucket bate certinho** (`sigma-print-app`, sem
variações tipo "printer-app"/"printer-agent") — um mismatch de nome aqui já

**Sempre incremente `WRAPPER_DOWNLOAD_VERSION`** (mesmo arquivo) toda vez que
subir um `.zip` novo — a URL do arquivo em si não muda, então sem esse `?v=N`
o navegador do restaurante pode continuar servindo um `.zip` antigo do cache
mesmo depois do arquivo já ter sido atualizado no servidor (isso já
aconteceu).
foi a causa de um link quebrado no passado.

## Protocolo com a página

A página (`restaurante/src/lib/printing.tsx`) manda:

```js
window.chrome.webview.postMessage(JSON.stringify({ type: "print-ticket" }));
```

sempre que uma comanda (nova, automática, ou clique manual no botão
imprimir) precisa sair. `MainForm.OnWebMessageReceived` escuta essa mensagem
e chama `PrintAsync` com margens zeradas — a largura do papel (58/80/88mm)
já vem resolvida do lado da página, via `@page` CSS injetado dinamicamente
(ver `restaurante/src/lib/printing.tsx`), não precisa de nada configurado
aqui do lado do C#.
