# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PDV Agência Sigma — a multi-tenant restaurant ordering platform. One agency (ADM) manages many restaurant tenants, each with their own menu, tables, and orders; end customers order through a public storefront. All user-facing text, comments in migrations, and commit-style rationale are in Portuguese (pt-BR) — keep new UI copy and SQL comments in Portuguese to match.

## Repository layout

This is **three independent Vite apps sharing one Supabase backend**, not a single app:

- `/` (root, package `pdv-agencia-sigma`) — customer-facing storefront/cardápio (menu browsing UI). Currently renders from static mock data in `src/data/menu.ts`; it has no `@supabase/supabase-js` dependency yet, unlike the other two apps.
- `admin/` — the agency's internal dashboard: restaurant CRUD, onboarding Kanban, account status, audit log. Requires an `admin` role profile.
- `restaurante/` — the restaurant owner's app: invite-based signup (`Cadastro`), login, and a post-signup welcome page. Requires a `restaurant_owner`/`restaurant_staff` profile.
- `supabase/` — the shared backend: SQL migrations (`supabase/migrations/`) and Deno Edge Functions (`supabase/functions/`).

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

## Frontend conventions

- React 19 + TypeScript + Vite + Tailwind v4 (via `@tailwindcss/vite`, no separate config file) + `lucide-react` icons.
- `admin/` and `restaurante/` use `react-router-dom` v7 with a shared `ProtectedRoute` component gating on `useSession()` (session + profile fetch from Supabase); the root storefront app has no routing yet.
- Supabase client setup lives at `<app>/src/lib/supabase.ts`; Edge Function error messages are normalized through `<app>/src/lib/functionError.ts`'s `describeFunctionError()` — use it instead of surfacing raw `FunctionsHttpError` bodies.
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in each app's `.env.local` (see `.env.local.example`).
