# Peak Form Training — trainer website

Marketing site and booking system for a one-to-one personal trainer whose clients
are mostly beginners and adults 50+. Visitors browse the site and request a
session from a calendar; the trainer confirms or cancels requests at `/admin`.

## Stack

- Next.js 16 (App Router, `cacheComponents` on), React 19, TypeScript
- Supabase (Postgres + Auth) via `@supabase/ssr` / `@supabase/supabase-js`
- nodemailer (SMTP) for the new-booking email
- Plain CSS in `app/globals.css` (design tokens on `:root`), no Tailwind/CSS framework
- Vitest + Testing Library (jsdom) for unit tests; Playwright + axe for e2e/a11y

## Commands

```
npm run dev:local                # http://localhost:3000 — local Supabase, no Gmail (use this)
npm run dev                      # careful: .env.development.local, if present, points at production
npm run build
npm run lint
npm test                         # vitest run (tests/**/*.test.ts[x])
                                 # tests/db/ hit local Supabase; skipped if it's not running
npm run test:e2e                 # playwright, starts its own dev server on :3100
npm run admin:add -- you@x.com   # create the trainer's account + add to admins
npx supabase start               # local Supabase; `npx supabase status` for keys
npx supabase db reset            # re-apply supabase/migrations
```

Copy `.env.example` to `.env.local` and fill it in. Locally, booking emails land
in the Supabase mail viewer at http://127.0.0.1:54324.

## Layout

- `app/(marketing)/` — public pages: home, about, services, testimonials, contact, book
- `app/(marketing)/book/actions.ts` — `submitBooking`, `getTakenTimes` server actions
- `app/admin/` — trainer's bookings page + emailed-code sign-in
- `app/admin/add-booking-form.tsx` — "Add a booking" (admin bookings, `addBooking`)
- `app/admin/edit-booking.tsx` — "Edit" on a booking card (`editBooking`); shares
  `booking-fields.tsx` with the add form
- `proxy.ts` — Next 16's renamed middleware; gates `/admin` only
- `lib/site.ts` — ALL site copy (name, trainer, services, prices, testimonials)
- `lib/session-types.ts` — session types (1-on-1, Partner, and a virtual version
  of each): ids, labels, tags, and `format` (in-person or virtual)
- `lib/booking-availability.ts` — bookable slots (generated, not from the DB),
  one schedule per format, and the trainer's break between sessions
- `lib/format.ts` — `DISPLAY_TIME_ZONE` and date/time formatting
- `lib/supabase/public.ts` — anon client (insert-only); `server.ts` — session client
- `lib/notify.ts` — new-booking email
- `components/marketing/` — page sections, `BookingCalendar`, `ContactForm`
- `supabase/migrations/` — schema; `0001`/`0002` are from the old client-portal
  design (`profiles`, `slots`, `bookings`) and are no longer used by the app

## Placeholders still to replace

- Everything in `lib/site.ts` is placeholder copy (Sarah Thompson, prices, quotes)
- Schedule: `SCHEDULES`, `SESSION_MINUTES`, `BREAK_MINUTES` in `lib/booking-availability.ts`
- Time zone: `DISPLAY_TIME_ZONE` in `lib/format.ts` (currently America/New_York)
- Privacy page (`SITE.privacy` in `lib/site.ts`) promises booking requests and
  their emails are deleted two years after a client's last session. A nightly
  pg_cron job (migration `0005`, grouping rewritten in `0007`) deletes the
  database rows, treating bookings as one client by email, else phone digits,
  else the row alone; the Gmail copies must be cleared by hand.

## How data and security work

- There are no client accounts. Anyone can submit a `booking_requests` row; the
  anon role can INSERT only, never read, so visitors' contact details are never
  served back through the site. RLS limits that public insert to a new website
  request (`source = 'website'`, `status = 'new'`).
- Every row has a `source`: `'website'` (from /book) or `'admin'` (the trainer
  added it at /admin with `addBooking`, migration `0008`). Email is required
  unless `source = 'admin'` (a check constraint). Only admins may insert admin
  bookings (RLS via `is_admin()`); they skip the slot schedule, are saved as
  confirmed, and are exempt from the per-email cap. See
  `docs/adr/0001-admin-bookings.md` and `GLOSSARY.md`.
- Every website request records a `session_type`: `'one-on-one'`, `'partner'`,
  `'virtual-one-on-one'` or `'virtual-partner'` (migrations `0011`, `0012`;
  text plus a check, no enum). The ids and labels live in
  `lib/session-types.ts`, which form, action, emails and /admin all import;
  `SITE.pricing` keeps its own copy and a unit test checks they agree. The
  column is nullable: older rows have no type (not backfilled) and admin
  bookings may leave it out. The public insert policy requires it, and so does
  `submitBooking`, which rejects a missing or unknown value. (The column's
  check only limits the values; "required for website requests" is not a
  check, since that would also block updating older untyped rows.)
  Its `format` picks the schedule: in-person types use the in-person slots,
  virtual types the virtual slots (weekends 11 to 4), and `submitBooking`
  refuses a time from the wrong one. Otherwise scheduling ignores it: same
  index, same per-email cap. The admin card shows a tag ("1-on-1", "Virtual
  partner", ...); the trainer's new-booking email and the Confirmed email add a
  "Session:" line, left out when there is no type. The video link is not
  stored; the trainer sends it in the Confirmed email's note.
- Taken times come from the `taken_booking_times()` SECURITY DEFINER function,
  which returns each live booking's start and end only, never who booked
  (migration `0009`). The calendar hides every slot a booking overlaps or
  sits less than the trainer's 45-minute break (`BREAK_MINUTES`) from, and
  `submitBooking` refuses one too (`clashesWithTaken`), since admin bookings
  can start at any quarter hour and the in-person and virtual schedules
  interleave at weekends. The admin add/edit overlap warning does not apply
  the break.
- Double booking is prevented by a unique index on live start times; the
  actions turn Postgres error `23505` into a friendly "just taken" message.
- `addBooking` also blocks an exact start-time clash itself; a booking that
  only overlaps another live one gets a warning naming it, and "Save anyway".
- The trainer can edit or move a live booking that hasn't started (`editBooking`,
  migration `0010`): admins may update name, email, phone, note, start and end,
  never `source`. A trigger stamps `updated_at` (the "Edited" tag) when any of
  those change and raises `PF002` for a cancelled or started booking. A new
  time follows the add rules (clash blocked, overlap warned). Changing details
  only emails nobody; moving a confirmed booking sends "Your session has moved"
  (`sendBookingMoved`); moving a new request also confirms it and sends the
  Confirmed email. "Don't email the client" suppresses either.
- Each email may hold at most 3 live future website requests (admin bookings
  neither count nor are capped): a trigger (migrations `0006`, `0008`) raises
  `PF001`, which `submitBooking` turns into a "you have a few
  waiting" message. The booking form also has a hidden bot-trap field
  (`website`), like the contact form: when filled, report success, save nothing.
- Admin access = signed in AND email in `admins` (`is_admin()`), enforced by row
  level security. Public sign-up is off; accounts come only from `admin:add`.
- Server actions are reachable by direct POST, so each re-validates its input
  (and the session, for admin actions). Keep doing this.
- The service role key is for `scripts/` only, never the running site.
  (`tests/db/` uses Supabase's public local-dev keys, pinned to 127.0.0.1.)
- Booking email is sent in `after()` and failures are only logged: a mail
  problem must never delay or undo a saved booking. Email bodies are plain text.
  An admin booking sends the client the Confirmed email only if it has an
  email, and never sends the trainer a new-booking email. Bookings with no
  email get no confirm/cancel email; the actions return `emailed: null`.
  Confirm and Cancel also offer "Don't email the client" (unticked by
  default); `confirmBooking`/`cancelBooking` skip the email only for
  `skipEmail === true`, and also return `emailed: null`.

## Conventions

- Audience is 60+: large type (18px base), WCAG 2.1 AA contrast, 48px minimum
  tap targets, clear focus styles. New UI must meet these; e2e runs axe checks.
- Motion lives only under `prefers-reduced-motion: no-preference`.
- Use the existing CSS tokens in `globals.css` rather than new hard-coded colors.
- Copy is warm, plain and reassuring; error messages say what to do next.
  US spelling ("program").
- Commits use conventional prefixes (`feat:`, `fix:`, `style:`, `chore:`).
- `AGENTS.md` is regenerated by `next dev` and is git-ignored; don't commit it.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on jconley-scales/trainer-websitep2 (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.