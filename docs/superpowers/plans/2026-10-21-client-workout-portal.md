# Client Workout Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A simple, accessible web portal where a trainer's clients log in with their email and book, view, and cancel their upcoming one-on-one training sessions.

**Architecture:** Next.js (App Router) on Vercel with Supabase (Postgres + Auth). Reads use Server Components, mutations use Server Actions. Pure booking logic lives in a domain module unit-tested in isolation; Postgres Row-Level Security enforces per-client data isolation; a partial unique index guarantees no double-booking.

**Tech Stack:** TypeScript, Next.js (App Router), Supabase (Postgres + Supabase Auth, email OTP), Vitest (unit), Playwright (e2e), Supabase CLI local stack for DB/RLS tests.

**Spec:** `docs/superpowers/specs/2026-10-21-client-workout-portal-design.md`

## Global Constraints

- Audience is 60+: single-column layouts, no hidden navigation, base font ≥ 18px, tap targets ≥ 48px, WCAG 2.1 AA contrast, never color-alone signaling, full keyboard + screen-reader support, plain language.
- Auth is passwordless **email 6-digit OTP** only (no passwords, no magic links) for v1.
- Every data read/write of `bookings` and `slots` is subject to Postgres RLS; application code must not be the only guard.
- One-on-one sessions: slot capacity is 1, enforced by a partial unique index on active bookings, not a counter.
- Destructive actions (cancel) always require an explicit confirm step.
- All session times stored as `timestamptz` (UTC) and displayed in a single configured local timezone.

## Review Focus

- **Slot start-time boundary:** a slot whose `starts_at` is now/just-passed must not appear as bookable and must not be cancellable — tested in Task 5.
- **Concurrent booking race:** two clients booking the same slot at the same instant — exactly one succeeds, the other gets a friendly message — tested in Task 5.
- **RLS cross-client access:** client A cannot read or cancel client B's booking even with a crafted request — tested in Task 2.
- **Expired/incorrect OTP:** wrong or expired code shows a clear inline error and allows resend, never logs the user in — tested in Task 4.
- **Double-action on same booking:** cancelling an already-cancelled booking, or booking a slot the client already holds, is rejected cleanly — tested in Task 5.

---

## File Structure

- `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `vitest.config.ts`, `playwright.config.ts` — project config.
- `app/layout.tsx`, `app/globals.css` — accessible base shell and design tokens.
- `app/login/page.tsx`, `app/login/actions.ts` — login screen + OTP server actions.
- `app/(portal)/sessions/page.tsx` — home: upcoming sessions.
- `app/(portal)/book/page.tsx` — book a session.
- `app/(portal)/actions.ts` — `bookSlotAction`, `cancelBookingAction` server actions (thin wrappers over the domain module).
- `middleware.ts` — protects `(portal)` routes, redirects unauthenticated users to `/login`.
- `lib/supabase/server.ts`, `lib/supabase/client.ts` — Supabase clients.
- `lib/booking.ts` — pure/domain booking logic (the testable core).
- `components/SessionCard.tsx`, `components/SlotRow.tsx`, `components/ConfirmDialog.tsx` — accessible UI units.
- `supabase/migrations/0001_init.sql` — schema, indexes, RLS policies.
- `supabase/seed/seed-slots.ts` — idempotent slot generator.
- `tests/` — unit + e2e tests mirroring the above.

---

## Task 1: Project scaffold & accessible base shell

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Test: `tests/smoke.test.tsx`

**Interfaces:**
- Produces: a running Next.js App Router app; `app/globals.css` design tokens (`--font-base: 18px`, AA-contrast color variables, min button size); root layout exposing the portal name in a header landmark.

- [ ] **Step 1: Write the failing test** — `tests/smoke.test.tsx`: renders `RootLayout` + a child, asserts a `<header>` with the portal name and that `--font-base` resolves to ≥ 18px.
- [ ] **Step 2: Run test, verify it fails** — `npx vitest run tests/smoke.test.tsx` → FAIL (module not found).
- [ ] **Step 3: Scaffold** the Next.js App Router project (TypeScript), add Vitest + Testing Library config, create `app/layout.tsx` (semantic header/main landmarks, skip-link) and `app/globals.css` (tokens from Global Constraints). Redirect `app/page.tsx` → `/sessions`.
- [ ] **Step 4: Run test, verify it passes** — `npx vitest run` → PASS.
- [ ] **Step 5: Commit** — `chore: scaffold next.js app with accessible base shell`.

---

## Task 2: Database schema & RLS policies

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Produces: tables `profiles(id uuid pk, full_name text, phone text, role text check in ('client','trainer'), created_at)`, `slots(id uuid pk, starts_at timestamptz, ends_at timestamptz, trainer_id uuid, location text, created_at)`, `bookings(id uuid pk, slot_id uuid fk, client_id uuid fk, status text check in ('booked','cancelled'), created_at, cancelled_at)`; partial unique index `uniq_active_booking_per_slot on bookings(slot_id) where status='booked'`; RLS enabled on all three.

- [ ] **Step 1: Write the failing test** — `tests/db/rls.test.ts` against the local Supabase stack: seed trainer, clients A and B, a slot, and A's booking. As B's JWT: `select` A's booking returns 0 rows; `update` A's booking to cancelled affects 0 rows. As A's JWT: A sees exactly A's own booking.
- [ ] **Step 2: Run test, verify it fails** — `npx supabase start && npx vitest run tests/db/rls.test.ts` → FAIL (relations/policies missing).
- [ ] **Step 3: Write the migration** — create the three tables, the partial unique index, and RLS policies: a client may `select`/`insert`/`update` a `bookings` row only where `client_id = auth.uid()`; `slots` are readable by any authenticated user; `profiles` readable/updatable only for `auth.uid() = id`.
- [ ] **Step 4: Run test, verify it passes** — `npx vitest run tests/db/rls.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat: add schema and RLS policies`.

---

## Task 3: Idempotent slot seed script

**Files:**
- Create: `supabase/seed/seed-slots.ts`
- Test: `tests/db/seed-slots.test.ts`

**Interfaces:**
- Consumes: schema from Task 2.
- Produces: `generateSlots(template: WeeklyTemplate, weeks: number, from: Date): SlotInput[]` and `seedSlots(db, slots): Promise<{inserted: number}>` where `WeeklyTemplate` is `{ weekday: 0-6, time: "HH:MM", durationMin: number, location: string, trainerId: string }[]`. Seeding is idempotent on `(trainer_id, starts_at)`.

- [ ] **Step 1: Write the failing test** — given a template of Mon/Wed/Fri 09:00 for 4 weeks, `generateSlots` returns 12 slots with correct `starts_at`/`ends_at`; running `seedSlots` twice leaves the slot count unchanged.
- [ ] **Step 2: Run test, verify it fails** — `npx vitest run tests/db/seed-slots.test.ts` → FAIL.
- [ ] **Step 3: Implement** `generateSlots` (expand template across `weeks` starting at `from`) and `seedSlots` (insert with `on conflict (trainer_id, starts_at) do nothing`; add that unique constraint to the migration from Task 2).
- [ ] **Step 4: Run test, verify it passes** — → PASS.
- [ ] **Step 5: Commit** — `feat: add idempotent slot seed script`.

---

## Task 4: Email OTP authentication & route protection

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`, `middleware.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`
- Test: `tests/auth/actions.test.ts`, `tests/e2e/login.spec.ts`

**Interfaces:**
- Consumes: Supabase Auth; `profiles` from Task 2.
- Produces: `sendCode(email: string): Promise<{ok: true} | {ok: false, error: string}>`, `verifyCode(email: string, code: string): Promise<{ok: true} | {ok: false, error: string}>`; on first successful verify, a `profiles` row with `role='client'` is created; `middleware.ts` redirects unauthenticated requests for `(portal)` routes to `/login`.

- [ ] **Step 1: Write the failing tests** — `actions.test.ts` (Supabase client stubbed): `verifyCode` with a wrong/expired code returns `{ok:false, error}` and does not create a session; a valid code returns `{ok:true}` and upserts a `client` profile. `login.spec.ts`: visiting `/sessions` unauthenticated redirects to `/login`; the login page shows the email step then the code step with large labeled inputs.
- [ ] **Step 2: Run tests, verify they fail** — `npx vitest run tests/auth` and `npx playwright test tests/e2e/login.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the two Supabase clients, `sendCode`/`verifyCode` (Supabase `signInWithOtp` / `verifyOtp`), the two-step login page (accessible per Global Constraints, with resend + inline errors), profile upsert on first login, and `middleware.ts` protection.
- [ ] **Step 4: Run tests, verify they pass** — → PASS.
- [ ] **Step 5: Commit** — `feat: add email OTP login and route protection`.

---

## Task 5: Booking domain logic

**Files:**
- Create: `lib/booking.ts`
- Test: `tests/booking.test.ts` (unit, DB-backed via local stack for the race/RLS-adjacent cases)

**Interfaces:**
- Consumes: schema from Task 2.
- Produces:
  - `listUpcomingSessions(db, clientId, now): Promise<Session[]>` — client's `booked` bookings with `slot.starts_at > now`, ascending.
  - `listAvailableSlots(db, now): Promise<Slot[]>` — future slots with no active booking, ascending.
  - `bookSlot(db, clientId, slotId, now): Promise<{ok:true, booking} | {ok:false, reason}>` where `reason ∈ {'past','taken','already-booked','not-found'}`.
  - `cancelBooking(db, clientId, bookingId, now): Promise<{ok:true} | {ok:false, reason}>` where `reason ∈ {'started','not-found','already-cancelled'}`.

- [ ] **Step 1: Write the failing tests** — booking an open future slot succeeds; booking a slot with `starts_at <= now` → `past`; a second booking of the same slot → `taken` (simulate the unique-index violation); booking a slot the client already holds → `already-booked`; `cancelBooking` before start frees the slot (it reappears in `listAvailableSlots`); cancelling after `starts_at <= now` → `started`; cancelling an already-cancelled booking → `already-cancelled`; a boundary slot with `starts_at === now` is excluded from `listAvailableSlots` and not cancellable.
- [ ] **Step 2: Run tests, verify they fail** — `npx vitest run tests/booking.test.ts` → FAIL.
- [ ] **Step 3: Implement** the four functions in `lib/booking.ts`, mapping the partial-unique-index violation to `taken` and enforcing the `now` boundary with `>` (strictly future).
- [ ] **Step 4: Run tests, verify they pass** — → PASS.
- [ ] **Step 5: Commit** — `feat: add booking domain logic`.

---

## Task 6: "Your sessions" home screen + cancel flow

**Files:**
- Create: `app/(portal)/sessions/page.tsx`, `app/(portal)/actions.ts`, `components/SessionCard.tsx`, `components/ConfirmDialog.tsx`
- Test: `tests/e2e/sessions.spec.ts`

**Interfaces:**
- Consumes: `listUpcomingSessions`, `cancelBooking` (Task 5); auth (Task 4).
- Produces: `cancelBookingAction(bookingId): Promise<void>` server action (resolves current user from session, calls `cancelBooking`, revalidates); the home route.

- [ ] **Step 1: Write the failing e2e test** — logged in with two seeded bookings, `/sessions` shows a heading "Your upcoming sessions", two cards (day/date/time/trainer/location) and a "Book a session" button; clicking Cancel opens a confirm dialog naming the date/time; confirming removes the card. Also assert the empty-state message when no bookings.
- [ ] **Step 2: Run test, verify it fails** — `npx playwright test tests/e2e/sessions.spec.ts` → FAIL.
- [ ] **Step 3: Implement** `SessionCard`, `ConfirmDialog` (accessible: focus trap, labeled, keyboard-dismissable), the server-rendered home page, empty state, and `cancelBookingAction`.
- [ ] **Step 4: Run test, verify it passes** — → PASS.
- [ ] **Step 5: Commit** — `feat: add sessions home screen and cancel flow`.

---

## Task 7: "Book a session" screen + book flow

**Files:**
- Create: `app/(portal)/book/page.tsx`, `components/SlotRow.tsx` (adds `bookSlotAction` to `app/(portal)/actions.ts`)
- Test: `tests/e2e/book.spec.ts`

**Interfaces:**
- Consumes: `listAvailableSlots`, `bookSlot` (Task 5).
- Produces: `bookSlotAction(slotId): Promise<void>` server action; the book route.

- [ ] **Step 1: Write the failing e2e test** — `/book` lists available slots grouped by day as large rows (date/time/location); tapping one opens a confirm ("Book your session on …?"); confirming returns to `/sessions` with the new session shown and a success message; a slot taken concurrently shows "that time was just taken".
- [ ] **Step 2: Run test, verify it fails** — `npx playwright test tests/e2e/book.spec.ts` → FAIL.
- [ ] **Step 3: Implement** `SlotRow`, the grouped-by-day book page, confirm step, `bookSlotAction` (maps `taken` to the friendly message), and success feedback on `/sessions`.
- [ ] **Step 4: Run test, verify it passes** — → PASS.
- [ ] **Step 5: Commit** — `feat: add book-a-session screen and booking flow`.

---

## Task 8: End-to-end accessibility pass

**Files:**
- Test: `tests/e2e/a11y.spec.ts`

**Interfaces:**
- Consumes: all screens.

- [ ] **Step 1: Write the failing test** — run `axe-core` against `/login`, `/sessions`, and `/book`; assert zero serious/critical violations and that interactive controls meet the ≥48px target and are reachable by keyboard with visible focus.
- [ ] **Step 2: Run test, verify it fails (or surfaces real violations)** — `npx playwright test tests/e2e/a11y.spec.ts`.
- [ ] **Step 3: Fix** any violations in the shared shell/components (contrast, labels, focus order) rather than per-page patches where possible.
- [ ] **Step 4: Run test, verify it passes** — → PASS.
- [ ] **Step 5: Commit** — `test: add end-to-end accessibility checks`.

---

## Self-review notes

- **Spec coverage:** login/accounts → Task 4; view upcoming sessions → Task 6; book from fixed weekly schedule → Tasks 3 + 7; simple cancel → Task 6; no-double-booking → Tasks 2 + 5; RLS isolation → Task 2; accessibility → Global Constraints + Task 8. All in-scope spec items map to a task.
- **Review Focus:** each of the five lines has an owning test (Tasks 2, 4, 5).
- **Out-of-scope items** (trainer admin, programs, progress, messaging, reminders) are intentionally absent.
