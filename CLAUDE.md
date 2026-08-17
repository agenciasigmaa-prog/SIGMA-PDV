# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PDV Agência Sigma — a multi-tenant restaurant ordering platform. One agency (ADM) manages many restaurant tenants, each with their own menu, tables, and orders; end customers order through a public storefront. All user-facing text, SQL comments, and code comments are in Portuguese (pt-BR) — keep new UI copy and comments in Portuguese to match. `PDV.md` (pt-BR) is a narrative, screen-by-screen product walkthrough for humans, kept in sync with the current model (`/loja/:restaurantId`, anonymous checkout, addons/combos/half-and-half, the printing agent, etc.) — treat it as accurate, not historical; update it alongside this file when a screen or flow changes. This file (`CLAUDE.md`) stays terser and code-anchored; `PDV.md` explains the same system in prose for a non-technical reader.

## Repository layout

This is **three independent Vite apps and one Go binary, sharing one Supabase backend**, not a single app:

- `/` (root, package `pdv-agencia-sigma`) — the customer-facing storefront. Talks to Supabase directly (`@supabase/supabase-js`) via `src/lib/supabase.ts`; menu data is loaded live by `src/lib/useMenu.ts` — there is no static/mock menu.
- `admin/` — the agency's internal dashboard: restaurant CRUD, onboarding Kanban, cross-tenant order view, account status, audit log. Requires an `admin` role profile.
- `restaurante/` — the restaurant owner/staff app: invite-based signup (`Cadastro`), login, dashboard, cardápio (menu) management, live order management (`Pedidos`), and printer setup (`Impressora`). Requires a `restaurant_owner`/`restaurant_staff` profile.
- `supabase/` — the shared backend: SQL migrations (`supabase/migrations/`) and Deno Edge Functions (`supabase/functions/`).
- `agente/` — the local ticket-printing agent (Go, not a Vite app): a single binary that runs on a computer in the restaurant and talks to `restaurante/` over `http://127.0.0.1:18080`. See "Ticket printing" below and `agente/README.md`.

Each of `admin/` and `restaurante/` is a fully separate npm project (own `package.json`, `node_modules`, `.env.local`) — always `cd` into the specific app directory before running its scripts. `agente/` is a separate Go module (own `go.mod`) — see its own build commands below, not `npm`. The Supabase project ref is `qedslrbzgklsxcbuokbl` (see `.mcp.json`); the Supabase MCP server is enabled for this repo, so prefer its tools (`list_tables`, `execute_sql`, `apply_migration`, `get_advisors`, `query_logs`, `deploy_edge_function`, etc.) over raw `supabase` CLI calls when inspecting or changing the live backend.

## Commands

Run from inside the relevant app directory (root, `admin/`, or `restaurante/`) unless noted:

```
npm run dev       # vite dev server — root:5173 (default), admin:5174, restaurante:5175
npm run build     # tsc -b && vite build
npm run lint      # oxlint (each app has its own .oxlintrc.json)
npm run preview   # vite preview
```

Tests exist **only in `admin/`** (vitest, `admin/src/lib/*.test.ts`):

```
cd admin && npm test                              # vitest run
cd admin && npx vitest run src/lib/orders.test.ts # single file
cd admin && npx vitest run -t "order_type"        # single test by name
```

These are pure-function tests with no DB or React involved — the most useful pattern in them is asserting that UI label maps cover every enum value declared in `supabase/migrations/0001_init.sql`, so a new DB enum value that the UI forgot to map fails the build instead of rendering blank. Extend that pattern when adding enum-backed UI.

`agente/` is a separate Go module — run its commands from inside `agente/`, not with `npm`:

```
go test ./...                                                                    # unit tests (escpos renderer + HTTP API), run on any OS
go vet ./...                                                                     # also run once with GOOS=windows to catch Windows-only build issues
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags "-s -w -H=windowsgui" -o dist/ImpressoraPDVSigma.exe ./cmd/agente
```

The build cross-compiles fine from Linux/WSL — no Windows machine needed to produce the `.exe`. Publishing a new build requires a manual copy into `restaurante/public/downloads/ImpressoraPDVSigma.exe` (see "Ticket printing" below); there is no CI step that does this automatically.

Edge functions live under `supabase/functions/<name>/index.ts` (Deno). Deploy with the Supabase MCP tool `mcp__supabase__deploy_edge_function`, not a local build step. Migrations are plain numbered SQL files in `supabase/migrations/`; apply with `mcp__supabase__apply_migration`. The numbering has a gap (0027–0029 never existed) — keep appending after the highest number rather than filling it.

## Backend architecture (Supabase)

**Tenancy model**: `restaurants` (tenant) → `profiles` (role: `admin` | `restaurant_owner` | `restaurant_staff` | `customer`, each linked to at most one `restaurant_id`) → `categories`/`products`/`tables`/`orders` scoped by `restaurant_id`. A Postgres trigger (`handle_new_user`) auto-creates a `customer` profile for every new `auth.users` row; staff/admin roles are never self-assigned — only elevated via the invite flow or an admin Edge Function.

**RLS is the primary authorization layer.** Two `security definer` helper functions, `current_app_role()` and `current_restaurant_id()`, read the caller's own profile and are used throughout the policies to avoid recursive RLS lookups. `categories`/`products`/`tables` are publicly readable (anon + authenticated) since the storefront needs to render menus without login; writes are restricted to the tenant's own staff/admin. When adding tables or columns, follow this same pattern (helper-function based policies, not inline subqueries) and re-run `get_advisors` after schema changes.

**Migration history is instructive** — several early migrations (`0002`–`0005`) are sequential fixes to the same RLS/trigger bugs (PUBLIC vs. named-role grants, and `security definer` swallowing `current_user` so Edge Functions running as `service_role` got blocked by `prevent_role_escalation`). Read `0004` and `0005` before touching that trigger again — the fix requires the trigger function to *not* be `security definer` so `current_user` reflects the real caller.

**Invite flow** (`0006_instant_invite_link.sql` + `check-invite`/`complete-invite` functions): creating a restaurant issues a random `invite_token` immediately, no owner form up front. `check-invite` (public) validates a token without leaking restaurant data. `complete-invite` (public) lets the owner pick their own email/password; `handle_new_user` reads `invite_token` from `raw_user_meta_data` and links the profile to the pending restaurant in the same insert — this path is a single INSERT, so it bypasses the UPDATE-only `prevent_role_escalation` trigger entirely.

**Admin Edge Functions** (`admin-create-restaurant`, `admin-manage-owner`, `admin-reset-password`, `admin-set-account-status`) all gate through `supabase/functions/_shared/admin-guard.ts`'s `requireAdmin()`: it validates the caller's JWT with an anon client, then checks their `profiles.role === 'admin'` via a service-role client before returning that service-role client for the privileged operation. Every privileged mutation should call `logAdminAction()` afterward to write to `admin_action_log`. Follow this exact guard + log pattern for any new admin-only function.

**Customer/staff Edge Functions** gate through `supabase/functions/_shared/customer-guard.ts` instead, which exports two guards used by the ordering functions below:
- `requireCustomer()` — any authenticated user (not role-restricted; dine-in ordering isn't limited to the `customer` role, since staff can also place manual orders through the same function).
- `requireRestaurantStaff()` — requires `restaurant_owner`/`restaurant_staff` and returns the caller's own `restaurant_id` from their profile (never trust a `restaurant_id` from the request body — compare against this value).

Both return a service-role client after validating the JWT, same pattern as `admin-guard.ts`.

## Ordering flow (current model)

The ordering domain was reworked away from an earlier QR-code-per-table / `table_sessions` comanda model (no longer in `PDV.md`, which now documents the current model below) to this one:

- **Entry point is per-restaurant, not per-table**: the storefront route is `/loja/:restaurantId` (`src/pages/Mesa.tsx` → `TableProvider` in `src/lib/TableContext.tsx`, which now just resolves the restaurant + its `restaurant_branding`, no `qr_token`/table lookup). The customer types their own name and table number as free text at checkout — there is no `tables.qr_token` in the live flow anymore.
- **Every confirmed order is its own ticket.** There is no more session/comanda grouping multiple orders under one open tab — `restaurante/src/lib/tableSessions.ts` and the old `/mesas` page have been removed in favor of a unified `restaurante/src/pages/Pedidos.tsx` order board. Don't reintroduce `table_sessions`-based grouping without checking whether the table still exists/is used.
- **Cart is 100% client-side** (`src/lib/CartContext.tsx`, `localStorage` keyed by `restaurantId`) until the customer hits "Confirmar pedido". **No real login is required** (explicit, temporary product decision — revisit later): `src/pages/MesaCardapio.tsx`'s `goToLoginOrSubmit()` calls `supabase.auth.signInAnonymously()` if there's no session yet, then submits immediately — the order is "indexed" only by the free-text name/table the customer types, not by a verified identity. Google OAuth sign-in was tried first but the `google` provider was never actually enabled on this Supabase project, so no real customer could ever complete checkout; anonymous sign-in also needed enabling under Authentication → Sign In / Providers → "Allow anonymous sign-ins" (done). Since anonymous sign-in resolves synchronously (no full-page redirect like OAuth), the earlier `localStorage` pending-order/pending-details survival hack is gone — don't reintroduce it without a reason. `handle_new_user` still fires for anonymous users, so they get a normal `customer`-role profile row and pass `requireCustomer()` in `place-dine-in-order` like any other caller.
- **Menu items can carry addons, combos, half-and-half, and removable ingredients** — `src/lib/useMenu.ts` loads `addon_groups`/`addons` (optionally `required` per category), `combo_items` (fixed combo components), `combo_choice_groups`/`combo_choice_options` ("choose your burger" style combos), and `product_ingredients` (removable ingredients, no price effect). Half-and-half pricing (`categories.allow_half_and_half`, `half_and_half_pricing`: `higher_price` | `average`) picks a second product from the same category as an alternate flavor.
- **The Edge Function `place-dine-in-order` (`supabase/functions/place-dine-in-order/index.ts`) is the only write path for placing an order.** It never trusts client-supplied prices or selections: it re-resolves product price, addon price, required-addon-group satisfaction, half-and-half price (recomputed server-side via the same formula as `src/lib/halfAndHalfPricing.ts`), combo choice validity, and removable-ingredient membership, all from the database, before inserting `orders`/`order_items`/`order_item_addons`/`order_item_combo_choices`/`order_item_removed_ingredients`. Reuse this validation pattern for any new mutation that touches order pricing.
- **Order channels**: `order_type` is `dine_in` (needs `table_label`), `pickup` (server generates a per-day sequential `pickup_code`), or `delivery` (needs a free-text `delivery_address`). The root storefront only drives the `dine_in` flow today; pickup/delivery orders are created by staff through `ManualOrderModal`.
- **Manual/staff-entered orders**: when the caller of `place-dine-in-order` is staff/admin (not a `customer`), `customer_id` is left `null` instead of the staff member's id, so the customer history doesn't get contaminated (see `0032_order_customer_id_nullable.sql`).
- **Staff order management** lives in `restaurante/src/pages/Pedidos.tsx`, backed by `restaurante/src/lib/orders.ts`'s `useIncomingOrders()` hook: a realtime (`postgres_changes` on `orders`) Kanban across `received → preparing → ready → completed` (plus `cancelled`), grouped/filterable by channel. The new-order sound notification (`restaurante/src/lib/orderSound.ts`, distinct chime for delivery vs. dine-in/pickup) does **not** live in this hook or this page — see "Ticket printing" below for where it actually lives and why.
- **Editing an already-placed order** (add/remove item, notes, discount, service charge) goes through the Edge Function `supabase/functions/staff-edit-order/index.ts` (`requireRestaurantStaff` guard), which — like `place-dine-in-order` — always re-resolves the item price from the database and always recomputes `subtotal`/`total` from scratch rather than incrementally. Registering a payment is the one mutation that doesn't touch pricing, so it goes through a direct RLS-gated update instead of this function.
- Financials: `orders.total = subtotal - discount_amount + service_charge_amount` (`0031_order_financeiro.sql`); `orders.notes` is a staff-entered free-text note (`0030_order_notes.sql`), separate from `order_items.notes` (per-item note).

## Ticket printing

Automatic ticket printing has now been attempted four times; the first three were removed entirely (repo and database) before this one:

1. **QZ Tray / ESC-POS** — its free tier uses self-signed certs whose trust prompt cannot be permanently dismissed ("Remember this decision" is deliberately disabled for untrusted certs); the fix is a paid certificate or a manual `override.crt` drop into QZ's install dir — too much setup friction for non-technical staff.
2. **`printer-app/`, a .NET 8 WinForms+WebView2 kiosk shell** wrapping the Pedidos page and printing silently via `CoreWebView2.PrintAsync`. Avoided QZ's trust problem, but was removed along with everything else.
3. **PrintBridge, a DB-backed print queue** (`print_stations`/`print_pairings`/`print_jobs`, an `orders` insert trigger enqueuing jobs, and a paired native agent polling an Edge Function for work). Removed by `0040_remove_printbridge.sql` before the native agent side was ever finished — see that migration's comments; as with the attempt before it, an orphan `'print_agent'` value is left inert in the `app_role` enum on purpose (dropping it would require recreating the type with `CASCADE`, which would drop every RLS policy in the project). `0034_remove_print_infra.sql` tore down the *second* dead end's DB side the same way (`print_jobs`/`print_agents`/`print_agent_pairings` — note the singular/plural table-name collision with PrintBridge's own `print_jobs`, a different table entirely, added later).

**The current (fourth) attempt is Impressora PDV-Sigma, source in `agente/`** — a single Go binary (`ImpressoraPDVSigma.exe`, shown in the Windows tray as "Impressora PDV-Sigma"), no external runtime, running on a computer in the restaurant and serving an HTTP API on `127.0.0.1:18080` only. The `restaurante/` app talks to it directly via `fetch()` from the browser — no cloud queue, no pairing, no database table for printing at all. See `agente/README.md` for the full design, build/install instructions, and the HTTP API.

- **Why local instead of a queue**: the previous three attempts all tried to route printing through infrastructure (a trust-prompted local service, a bundled browser shell, a polling agent against a DB queue) instead of just letting the browser talk to a local process directly. `127.0.0.1` is a secure context for `fetch()`, so no TLS/certificate story is needed — that alone kills the QZ Tray dead end. A local HTTP agent needs no queue to poll and no pairing handshake to keep in sync with the restaurant's `restaurant_id`, because the browser page (which already knows which restaurant it's logged into) talks to the agent directly.
- **The DSL lives in the frontend, not the agent**: `restaurante/src/lib/escposDoc.ts` builds a declarative command array (`{op: "text"|"columns"|"line"|"feed"|"cut", ...}`) from an `IncomingOrder` (see `restaurante/src/lib/orders.ts`); the agent's `internal/escpos/renderer.go` only knows how to turn that DSL into ESC/POS bytes (CP860 code page, partial cut, column widths for 58mm/80mm paper). This split means a formatting fix is a frontend deploy, not a re-distributed `.exe` — same reasoning the DB-DSL had in PrintBridge's `escpos-doc.ts`, just moved one hop over now that there's no server in the loop.
- **Origin allowlist, not TLS or pairing, is the security boundary**: the agent only answers requests whose `Origin` header is in a build-time allowlist (`agente/internal/httpapi/buildconfig.go`, extendable per-station via `extraOrigins` in `config.json`); anything else gets `403` and never learns the agent exists.
- **Scope is ESC/POS only, deliberately** — the agent is `CGO_ENABLED=0` Go, no MuPDF/cgo, so it cross-compiles cleanly and stays a ~6MB single file. `POST /print` with `formato: "pdf"` responds `501 Not Implemented`; there is no PDF/A4 rendering path.
- **Known constraint, not a bug**: Chrome 142+ requires a Local Network Access permission prompt (replacing the old Private Network Access model) the first time a public `https://` origin's page fetches a `127.0.0.1` address; it must be triggered by a user gesture. `localhost` dev origins are exempt. This is why `/impressora`'s "Imprimir página de teste" button exists as an explicit click rather than the page silently auto-detecting the agent on load — see `agente/README.md` for detail.
- **Tray icon, not a Windows Service, on purpose**: the agent shows a system tray icon (`agente/internal/trayapp/`) with an "Iniciar com o Windows" toggle (`agente/internal/autostart/`, an `HKCU\...\Run` registry entry) so it launches automatically at login. It is deliberately not a Windows Service — a Service runs in Session 0 before any login, with no desktop access at all, which is incompatible with showing a tray icon. Since a restaurant till stays logged into one Windows account all day, login-triggered start covers the real case without giving up the tray icon.
- **Auto-print + the new-order sound live in `RestaurantLayout.tsx`, not in `Pedidos.tsx`** (`restaurante/src/lib/autoPrint.ts`'s `useAutoPrintOnNewOrders`, mounted in `restaurante/src/components/RestaurantLayout.tsx` outside the `<Outlet/>`). This was a real bug, not a design choice made up front: it originally lived inside the Pedidos page component, so a new order only triggered a printout or a sound while staff had the Pedidos board open — closing it (e.g. to work in Cardápio or Dashboard) silently stopped printing. `RestaurantLayout` wraps every route and never unmounts on navigation, so the realtime `orders` INSERT listener there fires regardless of which screen is open. `useAutoPrintOnNewOrders` fetches the full order via `orders.ts`'s `fetchOrderById()` (a single-order query, since the layout doesn't have the whole board's order list loaded) rather than reusing `useIncomingOrders()`. Don't move this back into `Pedidos.tsx` — that's the exact regression this fixed. The manual reprint button (per order card) stays in `Pedidos.tsx`, since it's a deliberate action taken while already looking at that order.
- **The installer is downloadable from inside the app**: `/impressora` (`ConfiguracaoImpressao.tsx`) has a "Baixar ImpressoraPDVSigma.exe" button pointing at `/downloads/ImpressoraPDVSigma.exe`, served as a static file from `restaurante/public/downloads/` (Vite copies `public/` verbatim into the build — no Storage bucket, no CDN, no release pipeline at this stage). That means the compiled `.exe` (~7MB) is committed to git like any other static asset; publishing a new agent build means manually copying the freshly built binary into that path (see `agente/README.md`, "Publicar uma versão nova") before deploying `restaurante/`.

Don't reintroduce a print queue table, a pairing/token handshake, or a bundled third-party executable without re-reading this section and `agente/README.md` first.

## Frontend conventions

- React 19 + TypeScript + Vite + Tailwind v4 (via `@tailwindcss/vite`, no separate config file) + `lucide-react` icons. `restaurante/` additionally uses `@dnd-kit/*` for drag-and-drop menu ordering.
- `admin/` and `restaurante/` use `react-router-dom` v7 with a shared `ProtectedRoute` component gating on `useSession()` (session + profile fetch from Supabase); the root storefront app routes with `react-router-dom` too (`src/App.tsx`: `/` and `/loja/:restaurantId`).
- Supabase client setup lives at `<app>/src/lib/supabase.ts`; Edge Function error messages are normalized through `<app>/src/lib/functionError.ts`'s `describeFunctionError()` — use it instead of surfacing raw `FunctionsHttpError` bodies.
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in each app's `.env.local` (see `.env.local.example`).
- Menu/product images go to the public-read `menu-images` Storage bucket under `{restaurant_id}/{categories|products}/{uuid}.{ext}`; the write policy pins each tenant to its own folder via `storage.foldername(name)[1] = current_restaurant_id()`, so keep that path shape when uploading.
