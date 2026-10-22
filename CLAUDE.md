# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Non-standard Next.js — read the bundled docs first

This repo uses **Next.js 16.4.2**, which has breaking changes from older Next.js you may remember. Before writing framework code, read the relevant guide under `node_modules/next/dist/docs/` (resolved from the file you're editing). See `AGENTS.md` for the standing note — that `next dev`-generated block is re-added on every dev run, so commit it alongside your work to keep the tree clean rather than fighting it.

The most load-bearing rename: **middleware is now `proxy`**. Route protection lives in `proxy.ts` (exporting `proxy()` and `config`), not `middleware.ts`.

## Commands

```bash
npm run dev            # dev server (Next 16)
npm run build          # production build
npm run start          # serve the production build
npm run lint           # eslint (flat config, eslint.config.mjs)
npm run test           # vitest run — unit, integration, DB, component tests
npm run test:e2e       # playwright — e2e on port 3100 (spawns its own dev server)
npm run seed           # seed bookable slots into the DB (idempotent)
```

Running a subset:

```bash
npx vitest run tests/booking.test.ts        # one vitest file
npx vitest run -t "double booking"          # by test-name pattern
npx playwright test tests/e2e/book.spec.ts  # one e2e spec
```

## Local setup / environment

1. Copy `.env.example` → `.env.local` (git-ignored) and fill it in.
2. Start the local Supabase stack: `npx supabase start`, then `npx supabase status` to read the URL, anon key, service-role key, DB URL, and JWT secret into `.env.local`.
3. Paste the OTP email templates from `supabase/templates/` into Supabase Auth → Email Templates (Confirm signup **and** Magic Link). Without this, login emails send a link instead of the 6-digit code the login screen expects.

`SUPABASE_SERVICE_ROLE_KEY` is **required at runtime** — login (`verifyCode`) uses it to create the client's profile; without it every login fails.

**Tests that touch the database** (`tests/db/*`, `tests/booking.test.ts`, `tests/auth/actions.test.ts`) connect directly to Postgres via `pg` using `SUPABASE_DB_URL` from `.env.local`, so they need the local Supabase stack running and migrations applied. They impersonate roles with `set local role` + `request.jwt.claims` inside a rolled-back transaction, so they exercise the real RLS policies without leaving data behind. Pure component/unit tests (jsdom) need no DB.

## Architecture

A passwordless client booking portal bolted onto a public marketing site, built on Next.js App Router + Supabase. Target users are clients aged 60+, so accessibility (single column, large targets, plain language, keyboard/screen-reader support) is a hard requirement — see `docs/superpowers/specs/2026-10-21-client-workout-portal-design.md`.

### Route groups (`app/`)
- `(marketing)` — public pages (home, about, services, testimonials, contact). No auth round-trip.
- `(portal)` — signed-in client area: `/sessions` (home after login) and `/book`. Server-rendered.
- `login` — passwordless email OTP.

Each route group supplies its own chrome (header/`<main>`/footer); the root `app/layout.tsx` is just the document shell.

### The security model — RLS is the real gate
Authorization is enforced at the database by **row level security**, not in app code. Everything else is defense-in-depth or UX:

- **`proxy.ts`** is an *optimistic* gate: it only redirects signed-out visitors away from portal routes and refreshes session cookies. It is deliberately over-protective — `isProtectedPath` checks the raw path plus once/twice URL-decoded, lower-cased, slash-collapsed variants and **fails closed**. It is never the thing that protects data.
- Protected routes are defined solely by `PROTECTED_PREFIXES` in `lib/portal-routes.ts`. **When you add a portal route, add its top-level segment there**, or it will be public — `tests/auth/portal-routes.test.ts` fails if you forget.
- **Always use `getUser()`, never `getSession()`** — `getUser()` validates the token with Supabase Auth; `getSession()` trusts the cookie. This is consistent across `proxy.ts`, server actions, and login.
- **Server Actions** (`app/(portal)/actions.ts`, `app/login/actions.ts`) are directly POST-reachable, so they re-authenticate on every call and validate UUIDs before use. They use the **authenticated** client so RLS still applies — they never use the admin client for client-driven writes.

### Three Supabase clients — pick the right one
- `lib/supabase/client.ts` — browser (Client Components).
- `lib/supabase/server.ts` — Server Components / Actions / Route Handlers; reads/writes auth cookies via `cookies()`.
- `lib/supabase/admin.ts` — **service-role, bypasses RLS, `import "server-only"`**. Used only where RLS intentionally blocks the app, i.e. creating a profile at first login (`authenticated` has no INSERT grant on `profiles`, so users can't pick their own role). Never import it into a Client Component or use it for ordinary client-driven reads/writes.

### Database (`supabase/migrations/`)
Tables: `profiles` (1:1 with `auth.users`, holds `role`), `slots`, `bookings`.

- **Double-booking is prevented by the partial unique index `uniq_active_booking_per_slot`** (`status = 'booked'`), not by app checks. This is the authoritative guard.
- RLS: enabled on all tables with explicit per-role grants; `anon` gets nothing; nobody gets DELETE; `profiles` UPDATE is column-scoped to `full_name`/`phone` so a user can't escalate their own `role`.
- Two **`SECURITY DEFINER`** functions expose exactly the minimum data RLS would otherwise hide, without opening the tables: `available_slots(now)` (free future slots, without leaking who booked) and `trainer_public()` (trainer `id` + `full_name` only). Both set `search_path = ''` and schema-qualify every reference to prevent definer-context hijacking.

### Booking domain logic (`lib/booking.ts`)
Pure functions over a passed-in Supabase client, with `now: Date` **injected** so rules are deterministic and testable. "Future" is strictly `starts_at > now`. The pre-checks here exist only to return friendly reasons (`past` / `taken` / `already-booked`); the DB unique index is what actually prevents races. Callers must pass the **authenticated** client so RLS applies.

### Content & time zones
- `lib/site.ts` holds **all** marketing copy and nav as placeholders (`Peak Form Training` / `Sarah Thompson`). To rebrand, change only this file.
- Slot times are stored in **UTC** and displayed in a single gym-wide time zone set by `DISPLAY_TIME_ZONE` in `lib/format.ts` (currently `America/New_York`), so a session reads the same regardless of the visitor's device.
- The seed template in `scripts/seed.ts` (Mon/Wed/Fri mornings, "Main Gym") is a **placeholder in UTC** — replace the schedule, locations, and align with `DISPLAY_TIME_ZONE` for a real gym.

## Conventions
- Path alias: `@/*` → repo root (e.g. `@/lib/booking`).
- Contact form (`components/marketing/ContactForm.tsx`) has no backend — it builds a `mailto:` link client-side and deliberately keeps submitted data out of URLs/history.
- When reading guidance docs: `docs/superpowers/specs/` holds the approved design, `docs/superpowers/plans/` the implementation plan.
