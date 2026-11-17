# Peak Form Training

Marketing site and booking system for a one-to-one personal trainer whose
clients are mostly beginners and adults 50+.

Visitors browse the site and request a session from a calendar. The trainer
signs in at `/admin` with an emailed code to confirm, cancel, edit or add
bookings. There are no client accounts.

## Stack

- [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript
- [Supabase](https://supabase.com) — Postgres, row level security and Auth
- nodemailer (SMTP) for booking emails
- Plain CSS (`app/globals.css`), no CSS framework
- Vitest + Testing Library for unit tests, Playwright + axe for end-to-end and
  accessibility tests

## Getting started

You need Node.js, and Docker for the local Supabase stack.

```bash
npm install
npx supabase start          # local Postgres, Auth and mail viewer
cp .env.example .env.local  # then fill in the keys from `npx supabase status`
npx supabase db reset       # apply supabase/migrations
npm run admin:add -- you@example.com   # create a trainer account for /admin
npm run dev:local           # http://localhost:3000
```

Locally, every email (booking alerts, confirmations, sign-in codes) lands in
the Supabase mail viewer at http://127.0.0.1:54324.

> **Use `npm run dev:local`, not `npm run dev`.** Next.js loads
> `.env.development.local` ahead of `.env.local`, so if that file exists and
> points at the hosted project, plain `npm run dev` talks to production.
> `dev:local` forces the local values, blanks the SMTP login and refuses to
> start unless Supabase is local. Add `--no-email` to switch email off.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev:local` | Dev server against local Supabase only |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests; `tests/db/` runs only when local Supabase is up |
| `npm run test:e2e` | Playwright + axe; starts its own dev server on :3100 |
| `npm run admin:add -- <email>` | Create the trainer's account and add it to `admins` |

## Project layout

```
app/(marketing)/      public pages: home, about, pricing, testimonials, contact, book, privacy
app/admin/            trainer's bookings page and sign-in
components/marketing/ page sections, BookingCalendar, ContactForm
lib/site.ts           all site copy: name, trainer, services, prices, testimonials
lib/session-types.ts  session types (1-on-1, Partner, virtual versions)
lib/booking-availability.ts  bookable slots, schedules and break between sessions
lib/format.ts         display time zone and date formatting
lib/notify.ts         booking emails
proxy.ts              gates /admin (Next 16's renamed middleware)
supabase/migrations/  database schema, policies and triggers
scripts/              admin:add and dev:local (the only place the service role key is used)
tests/                unit, db and e2e tests
```

## Customizing

Most of what a trainer would want to change lives in a few files:

- **Copy, prices, testimonials, privacy text** — `lib/site.ts`
- **Weekly schedule, session length, break between sessions** —
  `SCHEDULES`, `SESSION_MINUTES`, `BREAK_MINUTES` in `lib/booking-availability.ts`
- **Time zone** — `DISPLAY_TIME_ZONE` in `lib/format.ts`
- **Session types** — `lib/session-types.ts` (a unit test checks they match
  `SITE.pricing`; new ids also need a migration, since the database checks them)

## How bookings work

- Anyone can submit a booking request. The public key can only *insert*
  requests, never read them, so contact details are never served back.
- The calendar hides times that are taken or too close to another booking;
  a unique index stops two live bookings starting at the same time.
- Each email address can hold at most three upcoming website requests.
- The trainer is emailed about each new request. Confirming, cancelling or
  moving a booking emails the client (with an option not to).
- A nightly job deletes booking records two years after a client's last
  session, as the privacy page promises.

`CLAUDE.md` has the full detail on data, security and conventions;
`GLOSSARY.md` defines the domain terms; `docs/adr/` records design decisions.

## Deployment

Production runs on Vercel, which deploys every push to `main`, with a hosted
Supabase project. Set the variables from `.env.example` in Vercel (all but
`SUPABASE_SERVICE_ROLE_KEY`, which the site never uses).

For the hosted Supabase project:

- Paste `supabase/templates/magic_link.html` into Auth → Email Templates →
  Magic Link so the sign-in email contains a code.
- Turn off "Allow new users to sign up" (Auth → Providers → Email).
- Set up custom SMTP so sign-in codes come from your own address.

**Push new migrations before pushing code to `main`**, or the new code will
deploy against the old schema. The Supabase CLI targets the local database by
default, so add `--remote`:

```bash
npx supabase db push --remote --dry-run
```

```bash
npx supabase db push --remote
```

## Conventions

The audience is 60+, so new UI needs an 18px base font size, WCAG 2.1 AA
contrast, 48px minimum tap targets and visible focus styles; the e2e suite
runs axe checks. Motion goes under `prefers-reduced-motion: no-preference`.
Copy is warm and plain, and error messages say what to do next. Commits use
conventional prefixes (`feat:`, `fix:`, `style:`, `chore:`).
