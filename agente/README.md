# Impressora PDV-Sigma

Binário único, em Go, sem runtime externo, que roda em segundo plano num
computador do restaurante e expõe uma API HTTP só em `127.0.0.1:18080`. A
tela **Impressora** do app `restaurante/` (`/impressora`) conversa com esse
binário via `fetch()` do navegador para listar impressoras, salvar
configuração e imprimir comandas.

Substitui três tentativas anteriores (QZ Tray, um shell WinForms+WebView2,
e o PrintBridge com fila no banco) — ver a seção "Ticket printing" em
`CLAUDE.md` na raiz do repo para o histórico completo.

## Por que não precisa de instalação pesada

- Sem Java/JRE (era o problema do QZ Tray).
- Sem certificado HTTPS autoassinado — `127.0.0.1` já é contexto seguro
  para o navegador, então `fetch()` funciona sem TLS.
- Sem Node, sem processo externo — um `.exe` só, ~6 MB, `CGO_ENABLED=0`
  (Go puro, sem MuPDF/cgo).

## Build

Requer Go 1.23+. Compilar a partir de qualquer SO (o build abaixo já é
cross-compilação, testado a partir do WSL):

```
cd agente
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -H=windowsgui" -o dist/ImpressoraPDVSigma.exe ./cmd/agente
```

`-H=windowsgui` faz o binário rodar sem janela de console. `-s -w` remove
símbolos de debug (binário menor). Testes (rodam em qualquer SO, usam um
printer stub fora do Windows):

```
go test ./...
```

## Publicar uma versão nova

Não há release/CDN nesta fase do projeto — o `.exe` é distribuído como
arquivo estático pelo próprio app `restaurante` (Vite copia tudo que está em
`public/` pro build sem processar nada). O botão "Baixar
ImpressoraPDVSigma.exe" em `/impressora`
(`restaurante/src/pages/ConfiguracaoImpressao.tsx`) aponta pra
`/downloads/ImpressoraPDVSigma.exe`. Pra publicar uma versão nova depois de
mexer no agente:

```
cd agente
# 1. bump `Version` em internal/httpapi/buildconfig.go primeiro
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -H=windowsgui" -o dist/ImpressoraPDVSigma.exe ./cmd/agente
cp dist/ImpressoraPDVSigma.exe ../restaurante/public/downloads/ImpressoraPDVSigma.exe
sha256sum ../restaurante/public/downloads/ImpressoraPDVSigma.exe
```

Depois é só o deploy normal do `restaurante` pegar o arquivo novo — não tem
step de build adicional, `public/` é copiado como está. Isso também
significa que o binário fica versionado no git como qualquer outro arquivo
estático (~7 MB); é intencional nesta fase, não um descuido.

**Passo extra desde o auto-update (ver seção abaixo): atualizar também
`restaurante/public/downloads/latest.json`** com a versão nova e o SHA-256
do `sha256sum` acima:

```json
{
  "version": "1.2.0",
  "url": "/downloads/ImpressoraPDVSigma.exe",
  "sha256": "<saída do sha256sum, só o hash>"
}
```

Esquecer esse arquivo não quebra nada na hora (o `.exe` novo continua
baixável manualmente), mas as estações já instaladas nunca vão detectar a
versão nova sozinhas — o `Version` do binário e o `version` do
`latest.json` são comparados numericamente pelo pacote `autoupdate`, e são
duas fontes de verdade que precisam ser bumpadas juntas.

## Instalação numa estação do restaurante

1. Copie `ImpressoraPDVSigma.exe` para uma pasta fixa, ex.
   `C:\ImpressoraPDVSigma\`.
2. Rode o `.exe` uma vez — ele cria `config.json` e
   `impressora-pdv-sigma.log` ao lado dele, com um `agentId` novo, aparece um
   ícone (a marca "S" da Sigma) na bandeja do Windows, e **já liga sozinho o
   "Iniciar com o Windows"** (só nessa primeira execução — se alguém
   desmarcar depois pelo menu, reabrir o `.exe` não liga de novo por baixo
   dos panos).
3. Abra o app `restaurante` no navegador daquela máquina, vá em
   **Impressora** e clique **"Imprimir página de teste"** — esse clique é o
   gesto de usuário necessário caso o Chrome mostre o prompt de Local
   Network Access (ver seção abaixo). Depois disso, selecione a impressora,
   a largura do papel e salve.

Não existe instalador nem Serviço do Windows nesta versão — só copiar o
`.exe`. "Iniciar com o Windows" grava uma entrada em
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (mesmo efeito de um
atalho na pasta Startup, sem precisar criar um `.lnk`); isso dispara **no
login do usuário**, não antes dele. Um Serviço do Windows de verdade
(`golang.org/x/sys/windows/svc`, caminho descrito no `ARQUITETURA.md`
original) rodaria antes do login, mas roda na Sessão 0, sem acesso nenhum à
área de trabalho — **incompatível com ter ícone na bandeja**. Como o caixa
de um restaurante fica com o Windows logado o dia inteiro, iniciar no login
cobre o caso de uso real sem abrir mão da bandeja.

## Ícone da bandeja

Clique direito no ícone mostra: versão rodando, o `agentId` desta estação
(útil pra bater com o que aparece em `impressora-pdv-sigma.log` ao
diagnosticar), o toggle de "Iniciar com o Windows" e "Sair" (encerra o
servidor HTTP de forma graciosa — dá até 5s pra terminar qualquer impressão
em andamento antes de fechar). O ícone (`cmd/agente/icon.ico`) é embutido no
binário via `go:embed`, gerado a partir de
`restaurante/src/assets/sigma-logo.png` (fundo removido, recortado quadrado,
multi-resolução 16/32/48/256).

Se o servidor HTTP não conseguir subir (a causa mais comum é a porta 18080
já estar presa por uma instância anterior travada), o ícone **continua
visível** com o item de status trocado pra "Erro ao iniciar — veja
impressora-pdv-sigma.log", em vez de sumir sem explicação. Se isso acontecer,
confira no Gerenciador de Tarefas (aba Detalhes) se há mais de um
`ImpressoraPDVSigma.exe` rodando e finalize os antigos.

## Auto-update

O agente se atualiza sozinho — sem isso, um fix (como o da allowlist de
origem abaixo, que ficou parado em produção até alguém reinstalar na mão)
só chega nas estações já instaladas se alguém no restaurante lembrar de
baixar o `.exe` de novo. Implementado em `internal/autoupdate/`:

- **No início de cada execução**, o agente confere
  `restaurante/public/downloads/latest.json` (mesmo domínio de produção já
  confiável); se a versão de lá for mais nova que a rodando, baixa o `.exe`,
  confere o SHA-256 declarado no manifesto e só então troca — antes mesmo
  de abrir a bandeja/servidor deste processo. Cobre o caso comum: o caixa
  liga o computador de manhã, o "Iniciar com o Windows" sobe o agente, e
  ele já entra na versão certa.
- **A cada 6h enquanto já está rodando**, repete a mesma checagem em
  segundo plano; se achar versão nova, baixa, valida, e só então pede pra
  bandeja encerrar como se fosse um "Sair" manual (mesma tolerância de 5s
  pra impressão em andamento terminar) — nunca troca o binário com o
  processo ainda no ar.
- **Depois de trocar**, espera a versão nova responder em `/health` por até
  15s antes de desistir da antiga de vez. Se não responder (build quebrado,
  por exemplo), desfaz a troca sozinho e relança a versão anterior — o
  binário quebrado fica salvo como `ImpressoraPDVSigma.exe.new.broken` ao
  lado, pra inspeção manual, mas a estação não fica sem agente rodando.
- A integridade depende de HTTPS + o SHA-256 do manifesto batendo com o
  `.exe` baixado — mesmo nível de confiança que o download manual já tinha,
  **não é verificação de assinatura de código**. Se isso vier a importar
  (o domínio ou o pipeline de deploy for comprometido), é um passo futuro,
  não coberto aqui.
- Publicar uma versão nova exige atualizar **duas** fontes de verdade
  juntas — `Version` em `buildconfig.go` e `restaurante/public/downloads/
  latest.json` — ver "Publicar uma versão nova" acima.

## Origens permitidas (segurança)

O agente só responde a requisições cujo header `Origin` esteja numa
allowlist — qualquer outro site que tente chamar `127.0.0.1:18080` recebe
`403` e segue o fluxo normal do navegador (não vê nem sabe que o agente
existe). A allowlist embutida no binário (`internal/httpapi/buildconfig.go`)
cobre o app restaurante em desenvolvimento
(`http://localhost:5175`/`http://127.0.0.1:5175`) e os domínios reais de
produção (`https://app.assessoriasigma.com.br` e o fallback
`https://sigma-pdv-restaurante.vercel.app`). Se surgir um domínio de
produção novo (domínio custom novo, ambiente de staging etc.), adicione-o
em `defaultAllowedOrigins` e republique (ver "Publicar uma versão nova") —
o auto-update acima faz esse fix chegar nas estações já instaladas sozinho,
sem precisar editar `config.json` de cada uma à mão. `extraOrigins` no
`config.json` de uma estação continua existindo só pra caso específico
daquela estação:

```json
{
  "extraOrigins": ["https://dominio-so-dessa-estacao.com.br"]
}
```

Essa lista não é editável pela própria API — só editando o arquivo à mão —
porque se fosse, qualquer site poderia se autoautorizar.

## Local Network Access do Chrome

Chrome 142+ substituiu o antigo modelo de Private Network Access por um
prompt de permissão explícito ("Local Network Access") sempre que um site
público (`https://…`) tenta falar com um endereço de rede local
(`127.0.0.1`, `192.168.x.x` etc.). Em desenvolvimento
(`http://localhost:5175` → `http://127.0.0.1:18080`) isso **não** acontece —
localhost para localhost não dispara o prompt. Em produção, o primeiro
`fetch()` do dia pode mostrar esse prompt ao usuário; ele precisa ser
disparado por um gesto explícito (clique), por isso a tela `/impressora`
pede pra clicar em "Imprimir página de teste" em vez de tentar detectar o
agente sozinha no carregamento da página. Uma vez concedida, a permissão é
lembrada pelo Chrome — diferente do certificado do QZ Tray, que pedia
confirmação toda vez.

## API

Todas as rotas exigem header `Origin` permitido (ver acima) ou respondem
`403`. Corpo e resposta em JSON.

| Rota | Descrição |
|---|---|
| `GET /health` | `{ok, version, agentId}` — usado pela tela pra detectar se o agente está rodando |
| `GET /printers` | `{printers: [{name, isDefault}]}` |
| `GET /config` | `{printerName, paperWidth, copies, autoPrint}` |
| `PUT /config` | mesmo corpo do GET; salva em `config.json` |
| `POST /print` | ver abaixo |

`POST /print`:

```json
{
  "type": "comanda_cozinha",
  "printerName": "EPSON TM-T20 (opcional, senão usa a impressora salva)",
  "copies": 1,
  "paperWidth": 80,
  "formato": "escpos",
  "commands": [
    { "op": "text", "value": "MESA 7", "bold": true, "align": "center", "size": "double" },
    { "op": "columns", "left": "2x X-Salada", "right": "R$ 40,00" },
    { "op": "line" },
    { "op": "feed", "lines": 3 },
    { "op": "cut" }
  ]
}
```

`commands` é o mesmo DSL declarativo montado em
`restaurante/src/lib/escposDoc.ts` (`op`: `text` | `columns` | `line` |
`feed` | `cut`). O agente só sabe traduzir esse DSL em bytes ESC/POS
(`internal/escpos/renderer.go`); ele não sabe nada sobre pedidos, produtos
ou preços — isso é responsabilidade do front. `formato: "pdf"` responde
`501 Not Implemented`: este agente não faz impressão de PDF/A4 (fora de
escopo por design, ver `ARQUITETURA.md` original).

Resposta de sucesso: `{"ok": true, "jobId": "job-1"}`. A requisição HTTP
fica bloqueada até a impressão terminar (ou até 60s de timeout) — não é
fire-and-forget — porque o board de Pedidos precisa saber na hora se deu
certo. Internamente as impressões são serializadas por uma única goroutine
worker consumindo de um channel (`internal/httpapi/queue.go`), então nunca
há duas impressões concorrentes na mesma impressora.

## Estrutura

```
cmd/agente/main.go              carrega config, sobe fila + servidor HTTP + bandeja
cmd/agente/icon.ico              ícone embutido via go:embed (marca Sigma)
internal/autoupdate/autoupdate.go     checa latest.json, baixa, valida e troca o binário sozinho
internal/config/config.go       config.json ao lado do binário (atômico)
internal/escpos/renderer.go     DSL -> bytes ESC/POS (CP860, corte parcial)
internal/printer/spooler_windows.go   winspool.drv via syscall (build windows)
internal/printer/spooler_stub.go      stub pra build/test fora do Windows
internal/httpapi/server.go      rotas + middleware de Origin
internal/httpapi/queue.go       fila serializada (channel + worker)
internal/trayapp/trayapp_windows.go   ícone de bandeja (fyne.io/systray)
internal/trayapp/trayapp_stub.go      stub pra build/test fora do Windows
internal/autostart/autostart_windows.go   toggle via registro HKCU\...\Run
internal/autostart/autostart_stub.go      stub pra build/test fora do Windows
```

## Troubleshooting

- **Tela mostra "agente não encontrado"**: confirme que
  `ImpressoraPDVSigma.exe` está rodando (ícone na bandeja, ou Gerenciador de
  Tarefas) e olhe `impressora-pdv-sigma.log` na mesma pasta.
- **Ícone da bandeja não aparece**: confira a seta de ícones ocultos (`^`)
  perto do relógio — o Windows esconde ícones novos ali até alguém arrastar
  pra área visível. Se realmente não subir nenhum, olhe
  `impressora-pdv-sigma.log`: a causa mais comum é a porta 18080 já estar em
  uso por uma instância travada de uma execução anterior — finalize todos os
  `ImpressoraPDVSigma.exe` no Gerenciador de Tarefas e rode de novo.
- **403 no `/print`**: a origem que chamou não está na allowlist — confira
  `extraOrigins` no `config.json` se for um domínio de produção novo (ou
  publique o domínio na allowlist de build, ver "Origens permitidas", que o
  auto-update propaga sozinho pras estações já instaladas).
- **Impressão parou depois de funcionar bem por um tempo**: confira
  `version` em `http://127.0.0.1:18080/health` contra o `version` de
  `restaurante/public/downloads/latest.json` — se o agente já tiver
  atualizado sozinho recentemente, tanto o log
  (`impressora-pdv-sigma.log`, entradas "autoupdate:") quanto um possível
  `ImpressoraPDVSigma.exe.new.broken` ao lado do `.exe` mostram se algo deu
  errado numa troca automática.
- **Acentuação sai errada no papel**: a página de teste imprime a linha
  `Acentuacao: ção pão açaí Coração` — se sair lixo aí, confirme que a
  impressora suporta CP860 (a maioria das térmicas ESC/POS suporta).
