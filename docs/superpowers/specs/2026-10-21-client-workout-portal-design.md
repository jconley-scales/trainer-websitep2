# Client Workout Portal — v1 Design Spec

**Date:** 2026-10-21
**Status:** Approved design, pending spec review

## Purpose

A simple, accessible web portal where a personal trainer's clients log in and
book and view their **upcoming training sessions** (one-on-one scheduled
appointments). Built on behalf of a trainer/gym to hand over as a working
product.

The primary users are **clients aged 60+**, so simplicity, clarity, and
accessibility are first-class requirements, not afterthoughts.

### Success criteria (v1)

- A client can log in with just their email (no password to remember).
- After logging in, a client immediately sees their upcoming sessions.
- A client can book an open session slot in a few taps.
- A client can cancel an upcoming session with a clear confirmation step.
- A client can never see or affect another client's data.
- The product is comfortably usable by a non-technical 60+ user and
  straightforward for a developer to maintain and extend later.

## Audience & accessibility requirements

Because the audience skews 60+, these are hard requirements, applied to every
screen:

- Single-column layouts; no hidden navigation (no hamburger menus, no
  multi-level menus).
- Large base font (~18–20px minimum) and large, clearly labeled buttons with
  generous tap targets (≥ 48px).
- High contrast meeting WCAG 2.1 AA or better; never rely on color alone to
  convey meaning.
- Plain, friendly language ("Your sessions", "Book a session"), no jargon.
- Full keyboard operability, visible focus states, screen-reader-friendly
  semantic HTML, and correct behavior at high browser zoom.
- Forgiving flows: confirmation steps before destructive actions, clear error
  messages in plain language, easy recovery.

## Scope

### In scope (v1)

1. Passwordless email login / accounts.
2. View upcoming sessions (the home screen after login).
3. Book an open session from a fixed weekly schedule.
4. Cancel an upcoming session (simple cancel, no time limit).

### Out of scope (roadmap / later phases)

- Trainer admin screen to manage availability and sessions.
- Workout programs (exercises, sets, reps) assigned to clients.
- Progress logging and charts.
- Trainer–client messaging.
- Automated session reminders (email/SMS) — a strong candidate for phase 2
  given the audience.
- Client self-service profile editing beyond the minimum.

## Technical approach

- **Framework:** Next.js (App Router), deployed on **Vercel**.
- **Data & auth:** **Supabase** (hosted Postgres + Supabase Auth).
- **Data access:** Server Components for reads and Server Actions for
  mutations; no separate custom API layer to maintain.
- **Auth method:** passwordless **email one-time code** (6-digit OTP typed into
  the app). Chosen over magic links because links frequently open in a
  different browser than the one the user started in, breaking the session —
  confusing for older users. SMS OTP is a friendlier but paid option, deferred
  to later.
- **Security:** Postgres **Row-Level Security (RLS)** so each client can only
  read and modify their own bookings, enforced at the database layer rather
  than only in application code.
- **Hosting cost:** fits comfortably within the free tiers of Vercel and
  Supabase for a single trainer with dozens of clients.

## Data model

### `profiles`
One row per authenticated user. Keyed to the Supabase `auth.users` id.

| field       | type        | notes                                  |
|-------------|-------------|----------------------------------------|
| id          | uuid (PK)   | equals `auth.users.id`                 |
| full_name   | text        | shown in UI                            |
| phone       | text (null) | optional, for future reminders         |
| role        | text        | `client` or `trainer`                  |
| created_at  | timestamptz | default now()                          |

### `slots`
Concrete, bookable time slots materialized from the fixed weekly template for
the upcoming weeks.

| field       | type        | notes                                  |
|-------------|-------------|----------------------------------------|
| id          | uuid (PK)   |                                        |
| starts_at   | timestamptz | start of session                       |
| ends_at     | timestamptz | end of session                         |
| trainer_id  | uuid (FK)   | references `profiles.id` (role trainer)|
| location    | text        | e.g. "Main gym", shown to client       |
| created_at  | timestamptz | default now()                          |

Capacity is 1 (one-on-one personal training). "One booking per slot" is
enforced by the booking uniqueness rule below rather than a capacity counter.

### `bookings`
Links a client to a slot.

| field        | type        | notes                                 |
|--------------|-------------|---------------------------------------|
| id           | uuid (PK)   |                                       |
| slot_id      | uuid (FK)   | references `slots.id`                  |
| client_id    | uuid (FK)   | references `profiles.id` (role client) |
| status       | text        | `booked` or `cancelled`               |
| created_at   | timestamptz | default now()                         |
| cancelled_at | timestamptz | null unless cancelled                 |

**No-double-booking guarantee:** a partial unique index on `slot_id` where
`status = 'booked'` ensures at most one active booking per slot. Two
simultaneous bookings for the same slot → one succeeds, the other gets a
friendly "that time was just taken" error.

### Derived views used by the UI

- **Your upcoming sessions:** `bookings` for the current client where
  `status = 'booked'` and the joined `slots.starts_at` is in the future,
  ordered by `starts_at` ascending.
- **Available slots to book:** `slots` with `starts_at` in the future that have
  no active (`booked`) booking, ordered by `starts_at`.

## Screens & flows

All screens are single-column and share a simple header with the portal name
and, when logged in, a "Log out" control.

### 1. Login
- Step 1: "Enter your email" — a single large input and a big **Send me a code**
  button.
- Step 2: "Enter the 6-digit code we emailed you" — large code input and a big
  **Log in** button, plus a "Resend code" option.
- Clear, plain instructions and visible error messages (wrong/expired code).

### 2. Your sessions (home, after login)
- Big heading: "Your upcoming sessions".
- Prominent **Book a session** button near the top.
- A vertical list of session cards, each showing: day of week, date, time,
  trainer name, and location, with a large **Cancel** button.
- Empty state: a friendly message ("You have no upcoming sessions") and the
  **Book a session** button.

### 3. Book a session
- Heading: "Book a session".
- Upcoming open slots grouped by day, each a large tappable row showing date,
  time, and location.
- Tapping a slot → a **confirm** screen ("Book your session on Tue, Oct 28 at
  10:00 AM?") with big **Yes, book it** / **No, go back** buttons.
- On success → return to "Your sessions" with a visible confirmation message.

### 4. Cancel confirmation
- Triggered by the Cancel button on a session card.
- "Cancel your session on Tue, Oct 28 at 10:00 AM?" with big **Yes, cancel** /
  **No, keep it** buttons.
- On success → the session leaves the upcoming list, the slot becomes available
  again, and a confirmation message is shown.

## Booking & schedule logic

- **Slot generation:** a re-runnable **seed script** materializes `slots` from a
  fixed weekly template (e.g. Mon/Wed/Fri mornings) for the next ~4 weeks. To
  keep the booking window rolling forward, the script is idempotent (does not
  duplicate existing slots) and can be re-run periodically; automating this
  (a scheduled job) is noted as a follow-up but not required for v1.
- **Book:** server action verifies the slot exists, is in the future, and has
  no active booking, then inserts a `booked` booking. The partial unique index
  is the authoritative safeguard against races.
- **Cancel:** server action sets the booking `status = 'cancelled'` and
  `cancelled_at = now()`, allowed any time before the session's `starts_at`.
  This frees the slot for others.

## Error handling

- **Slot taken during booking (race):** unique-index violation is caught and
  shown as "Sorry, that time was just taken. Please choose another."
- **Booking a past slot:** blocked server-side; such slots are not shown as
  available.
- **Cancelling a started/past session:** not permitted; Cancel is not offered
  for sessions whose start time has passed.
- **Expired or missing session:** redirect to the login screen with a clear
  message.
- **Invalid/expired login code:** inline, plain-language error with a resend
  option.

## Testing strategy

Built test-first alongside the implementation.

- **Unit tests** for booking/cancel rules: booking an open future slot
  succeeds; double-booking the same slot fails; booking a past slot is
  rejected; cancelling frees the slot; cancelling a started session is
  rejected.
- **Security test** proving RLS isolation: a client cannot read or modify
  another client's bookings.
- **End-to-end tests** for the two core flows (book a session, cancel a
  session) against a test database, with auth stubbed/seeded.

## Open items to confirm during implementation

- Exact fixed weekly schedule (which days/times/location) to seed — placeholder
  Mon/Wed/Fri mornings until the trainer provides real hours.
- Single trainer is assumed for v1; the data model already supports multiple
  trainers if needed later with no schema change.
- Branding (portal name, colors, logo) — accessible defaults until provided.
