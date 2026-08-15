# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PDV Agência Sigma — a multi-tenant restaurant ordering platform. One agency (ADM) manages many restaurant tenants, each with their own menu, tables, and orders; end customers order through a public storefront. All user-facing text, comments in migrations, and commit-style rationale are in Portuguese (pt-BR) — keep new UI copy and SQL comments in Portuguese to match. `PDV.md` (pt-BR) is a narrative walkthrough of the product screen-by-screen; it documents an earlier iteration of the ordering flow (per-table QR codes, `table_sessions` comandas) that has since been replaced — see "Ordering flow" below for the current model. Treat `PDV.md` as historical context, not ground truth.

## Repository layout

This is **three independent Vite apps plus one native companion app, sharing one Supabase backend**, not a single app:

- `/` (root, package `pdv-agencia-sigma`) — the customer-facing storefront. Talks to Supabase directly (`@supabase/supabase-js`) via `src/lib/supabase.ts`; menu data is live, not the static mock in `src/data/menu.ts` (legacy, no longer wired into the routed pages).
- `admin/` — the agency's internal dashboard: restaurant CRUD, onboarding Kanban, cross-tenant order view, account status, audit log. Requires an `admin` role profile.
- `restaurante/` — the restaurant owner/staff app: invite-based signup (`Cadastro`), login, dashboard, cardápio (menu) management, and live order management (`Pedidos`). Requires a `restaurant_owner`/`restaurant_staff` profile.
- `supabase/` — the shared backend: SQL migrations (`supabase/migrations/`) and Deno Edge Functions (`supabase/functions/`).
- `printer-app/` — a minimal .NET 8 WinForms+WebView2 shell (`SigmaPrintApp/`) that embeds the `restaurante/` **Pedidos** page in a kiosk window and auto-prints tickets; not a Vite app, see "Ticket printing" below.

Each of `admin/` and `restaurante/` is a fully separate npm project (own `package.json`, `node_modules`, `.env.local`) — always `cd` into the specific app directory before running its scripts. The Supabase project ref is `qedslrbzgklsxcbuokbl` (see `.mcp.json`); the Supabase MCP server is enabled for this repo, so prefer its tools (`list_tables`, `execute_sql`, `apply_migration`, `get_advisors`, `query_logs`, `deploy_edge_function`, etc.) over raw `supabase` CLI calls when inspecting or changing the live backend.

## Commands

Run from inside the relevant app directory (root, `admin/`, or `restaurante/`) unless noted:

```
npm run dev       # vite dev server — root:5173 (default), admin:5174, restaurante:5175
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # vite preview
```

There is no test suite configured in any of the three apps. Each app has its own `.oxlintrc.json`.

Edge functions live under `supabase/functions/<name>/index.ts` (Deno). Deploy with the Supabase MCP tool `mcp__supabase__deploy_edge_function`, not a local build step. Migrations are plain numbered SQL files in `supabase/migrations/`; apply with `mcp__supabase__apply_migration`.

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

The ordering domain has been reworked away from the QR-code-per-table / `table_sessions` comanda model described in `PDV.md`. Current model:

- **Entry point is per-restaurant, not per-table**: the storefront route is `/loja/:restaurantId` (`src/pages/Mesa.tsx` → `TableProvider` in `src/lib/TableContext.tsx`, which now just resolves the restaurant + its `restaurant_branding`, no `qr_token`/table lookup). The customer types their own name and table number as free text at checkout — there is no `tables.qr_token` in the live flow anymore.
- **Every confirmed order is its own ticket.** There is no more session/comanda grouping multiple orders under one open tab — `restaurante/src/lib/tableSessions.ts` and the old `/mesas` page have been removed in favor of a unified `restaurante/src/pages/Pedidos.tsx` order board. Don't reintroduce `table_sessions`-based grouping without checking whether the table still exists/is used.
- **Cart is 100% client-side** (`src/lib/CartContext.tsx`, `localStorage` keyed by `restaurantId`) until the customer hits "Confirmar pedido". **No real login is required** (explicit, temporary product decision — revisit later): `src/pages/MesaCardapio.tsx`'s `goToLoginOrSubmit()` calls `supabase.auth.signInAnonymously()` if there's no session yet, then submits immediately — the order is "indexed" only by the free-text name/table the customer types, not by a verified identity. Google OAuth sign-in (`supabase.auth.signInWithOAuth`) was tried first but the `google` provider was never actually enabled on this Supabase project, so no real customer could ever complete checkout; anonymous sign-in also needed enabling under Authentication → Sign In / Providers → "Allow anonymous sign-ins" (done). Since anonymous sign-in resolves synchronously (no full-page redirect like OAuth), the earlier `localStorage` pending-order/pending-details survival hack is gone — don't reintroduce it without a reason. `handle_new_user` still fires for anonymous users (unconditional insert into `auth.users`), so they get a normal `customer`-role profile row and pass `requireCustomer()` in `place-dine-in-order` like any other caller.
- **Menu items can carry addons, combos, half-and-half, and removable ingredients** — `src/lib/useMenu.ts` loads `addon_groups`/`addons` (optionally `required` per category), `combo_items` (fixed combo components), `combo_choice_groups`/`combo_choice_options` ("choose your burger" style combos), and `product_ingredients` (removable ingredients, no price effect). Half-and-half pricing (`categories.allow_half_and_half`, `half_and_half_pricing`: `higher_price` | `average`) picks a second product from the same category as an alternate flavor.
- **The Edge Function `place-dine-in-order` (`supabase/functions/place-dine-in-order/index.ts`) is the only write path for placing an order.** It never trusts client-supplied prices or selections: it re-resolves product price, addon price, required-addon-group satisfaction, half-and-half price (recomputed server-side via the same formula as `src/lib/halfAndHalfPricing.ts`), combo choice validity, and removable-ingredient membership, all from the database, before inserting `orders`/`order_items`/`order_item_addons`/`order_item_combo_choices`/`order_item_removed_ingredients`. Reuse this validation pattern for any new mutation that touches order pricing.
- **Order channels**: `order_type` is `dine_in` (needs `table_label`), `pickup` (server generates a per-day sequential `pickup_code`), or `delivery` (needs a free-text `delivery_address`). The root storefront only drives the `dine_in` flow today; pickup/delivery orders are created by staff through `ManualOrderModal`.
- **Manual/staff-entered orders**: when the caller of `place-dine-in-order` is staff/admin (not a `customer`), `customer_id` is left `null` instead of the staff member's id, so the customer history doesn't get contaminated (see `0032_order_customer_id_nullable.sql`).
- **Staff order management** lives in `restaurante/src/pages/Pedidos.tsx`, backed by `restaurante/src/lib/orders.ts`'s `useIncomingOrders()` hook: a realtime (`postgres_changes` on `orders`/`order_items` etc.) Kanban across `received → preparing → ready → completed` (plus `cancelled`), grouped/filterable by channel. New inserts trigger a sound notification (`restaurante/src/lib/orderSound.ts`, distinct chime for delivery vs. dine-in/pickup) via Web Audio, and (if enabled) auto-print the ticket — see "Ticket printing" below.
- **Editing an already-placed order** (add/remove item, notes, discount, service charge) goes through the Edge Function `supabase/functions/staff-edit-order/index.ts` (`requireRestaurantStaff` guard), which — like `place-dine-in-order` — always re-resolves the item price from the database and always recomputes `subtotal`/`total` from scratch rather than incrementally. Registering a payment is the one mutation that doesn't touch pricing, so it goes through a direct RLS-gated update instead of this function.
- Financials: `orders.total = subtotal - discount_amount + service_charge_amount` (`0031_order_financeiro.sql`); `orders.notes` is a staff-entered free-text note (`0030_order_notes.sql`), separate from `order_items.notes` (per-item note).

## Ticket printing

An earlier attempt (`ComandaPrint`/`ConfiguracaoImpressora`, ESC/POS via QZ Tray certificate signing) was tried and reverted — QZ Tray's free/self-signed-cert trust model turned out to require either a paid QZ Industries certificate or a manual `override.crt` file dropped into QZ Tray's own install directory to ever stop prompting (its "Remember this decision" checkbox is deliberately disabled for untrusted/self-signed certs — this is QZ's own security design, not a bug), which was too much setup friction for non-technical restaurant staff. Current approach: **`printer-app/`**, a from-scratch redesign built on the browser's own print pipeline instead of raw ESC/POS bytes.

- **No backend involvement** — printing is pure frontend. `restaurante/src/lib/printing.tsx`'s `printTicket(order)` renders `TicketPrintView` (HTML/CSS, not ESC/POS — pt-BR accents just work via UTF-8) into a hidden `#print-ticket` container, waits a frame for React to commit, then triggers the print. Paper width (`58mm`/`80mm`/`88mm`) and the auto-print on/off toggle are pure `localStorage` prefs (`restaurante/src/pages/ConfiguracaoImpressao.tsx`), no DB column.
- **Two print paths, chosen at runtime by `printTicket`**: inside the `printer-app/` WebView2 shell it posts `{"type": "print-ticket"}` via `window.chrome.webview.postMessage`, which `SigmaPrintApp/MainForm.cs` receives and prints silently through `CoreWebView2.PrintAsync` (no dialog) to whatever is the Windows default printer; in a plain browser (e.g. local dev) it falls back to `window.print()`. Paper size is enforced by an injected `@page { size: ... }` rule (Chromium requires a static CSS rule for page size, not a CSS variable) — the C# side has no printer/paper config at all. **This is what makes `printer-app/` avoid QZ Tray's whole trust-popup problem**: `CoreWebView2.PrintAsync` is a privileged API available to any app that embeds a WebView2 control natively — it needs no certificate, no signing, no external trust dance at all.
- **Tenant isolation for the printer app comes from Supabase auth, not from the app itself** — `printer-app/` has no secrets, pairing keys, or knowledge of `restaurant_id`; it's a bare browser shell that loads the same authenticated `restaurante/` Pedidos page RLS already scopes.
- **The `.zip` is built framework-dependent, not self-contained** (`dotnet publish -c Release -r win-x64 --self-contained false`, ~2MB) — a self-contained/single-file build was tried first (~65MB) but exceeded the 50MB per-file cap of the Supabase Storage free tier bucket that hosts it publicly. Framework-dependent requires the .NET 8 Desktop Runtime on the restaurant's PC; if missing, Windows itself shows an official Microsoft prompt with the download link on first launch (same pattern already used for the WebView2 Runtime dependency) — see `printer-app/README.md` for the full rationale and build/publish steps before changing this.
- Hosted at the public Supabase Storage bucket **`sigma-print-app`** (exact name — a prior bucket-name mismatch, `printer-app-releases` in code vs. `printer-agent-releases` actually created, silently broke the download link for a while; double-check the name matches exactly whenever touching this) and linked from `ConfiguracaoImpressao.tsx`'s `WRAPPER_DOWNLOAD_URL`.

## Frontend conventions

- React 19 + TypeScript + Vite + Tailwind v4 (via `@tailwindcss/vite`, no separate config file) + `lucide-react` icons.
- `admin/` and `restaurante/` use `react-router-dom` v7 with a shared `ProtectedRoute` component gating on `useSession()` (session + profile fetch from Supabase); the root storefront app routes with `react-router-dom` too (`src/App.tsx`: `/` and `/loja/:restaurantId`).
- Supabase client setup lives at `<app>/src/lib/supabase.ts`; Edge Function error messages are normalized through `<app>/src/lib/functionError.ts`'s `describeFunctionError()` — use it instead of surfacing raw `FunctionsHttpError` bodies.
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in each app's `.env.local` (see `.env.local.example`).
