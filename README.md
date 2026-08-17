# PDV Agência Sigma

Plataforma de pedidos multi-tenant para restaurantes. Uma agência (Sigma) gerencia vários restaurantes clientes; cada restaurante tem seu próprio cardápio e board de pedidos; o cliente final pede pelo cardápio público, sem precisar criar conta.

- **Documentação para humanos** (o que o produto faz, tela por tela): [`PDV.md`](./PDV.md)
- **Documentação para o Claude Code** (arquitetura, convenções, decisões técnicas): [`CLAUDE.md`](./CLAUDE.md)
- **Agente de impressão local** (binário Go, `ImpressoraPDVSigma.exe`): [`agente/README.md`](./agente/README.md)

## O que é

- **Uma agência, muitos restaurantes.** Cada restaurante (`tenant`) tem seu próprio cardápio, mesas e pedidos, isolados dos demais por `restaurant_id` e Row Level Security no Postgres — não por lógica de frontend.
- **Cliente pede sem criar conta.** O carrinho é 100% local até o cliente confirmar o pedido; login é anônimo e automático nesse momento, não uma etapa separada.
- **Impressão silenciosa de comanda**, via um agente nativo (Go) instalado no computador do restaurante — sem fila em nuvem, sem depender da aba do navegador estar numa tela específica.

## Repositório

Não é um app só — são **quatro projetos independentes** compartilhando um único backend Supabase:

| Pasta | O que é | Porta (dev) |
|---|---|---|
| `/` (raiz, `pdv-agencia-sigma`) | Cardápio público do cliente final | 5173 |
| `admin/` | Painel interno da agência (gestão de tenants) | 5174 |
| `restaurante/` | Painel do dono/equipe do restaurante | 5175 |
| `agente/` | Agente de impressão local (Go, não é um app Vite) | `127.0.0.1:18080` |
| `supabase/` | Backend compartilhado — migrations SQL + Edge Functions (Deno) | — |

`admin/` e `restaurante/` são projetos npm totalmente separados (`package.json`, `node_modules` e `.env.local` próprios) — sempre `cd` pra pasta certa antes de rodar scripts. `agente/` usa Go, não Node.

## Rodando localmente

Cada app Vite precisa do seu próprio `.env.local` (veja `.env.local.example` em cada pasta) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

```bash
# Storefront (raiz)
npm install
npm run dev          # http://localhost:5173

# Painel do restaurante
cd restaurante && npm install
npm run dev           # http://localhost:5175

# Painel da agência
cd admin && npm install
npm run dev            # http://localhost:5174
```

Cada app tem `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint) e `npm run preview`. Testes existem só em `admin/` (`cd admin && npm test`).

### Agente de impressão (opcional, só pra testar impressão local)

```bash
cd agente
go test ./...
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -H=windowsgui" -o dist/ImpressoraPDVSigma.exe ./cmd/agente
```

Detalhes de instalação, API HTTP e arquitetura em [`agente/README.md`](./agente/README.md).

## Backend (Supabase)

Um único projeto Supabase (Postgres + Auth + Storage + Edge Functions) sustenta os quatro apps — não existe API própria, cada app fala direto com o Supabase e a autorização é garantida por RLS. Migrations em `supabase/migrations/`, Edge Functions em `supabase/functions/<nome>/index.ts` (Deno). O projeto tem o servidor MCP do Supabase habilitado (veja `.mcp.json`) — prefira as ferramentas MCP (`list_tables`, `execute_sql`, `apply_migration`, `get_advisors`, `deploy_edge_function`, etc.) a chamadas diretas do CLI `supabase` ao inspecionar ou alterar o backend.

Mais detalhes de arquitetura (modelo de tenancy, RLS, fluxo de pedido, impressão) em [`CLAUDE.md`](./CLAUDE.md).
