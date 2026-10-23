-- Public booking requests.
--
-- The site no longer has client accounts or a login. Anyone can submit a
-- booking request from the public /book page; the trainer reads them in the
-- Supabase dashboard (the service role bypasses RLS). Nobody using the public
-- anon/authenticated keys can READ these rows, so the names, emails and phone
-- numbers people submit are never exposed back through the site.

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  phone text check (phone is null or char_length(phone) <= 40),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'new' check (status in ('new', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index booking_requests_starts_at_idx on public.booking_requests (starts_at);

alter table public.booking_requests enable row level security;

-- Explicit privileges: the public keys may INSERT a request and nothing else.
-- No SELECT/UPDATE/DELETE grant and no SELECT policy => reads are blocked for
-- anon and authenticated. The trainer views rows in the Supabase dashboard.
revoke all on public.booking_requests from anon, authenticated;
grant insert on public.booking_requests to anon, authenticated;

create policy "anyone may submit a booking request" on public.booking_requests
  for insert to anon, authenticated
  with check (true);
