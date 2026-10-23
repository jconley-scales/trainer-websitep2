-- Trainer admin access to booking requests, and no double booking.

-- Who may manage bookings. Rows are added with `npm run admin:add -- you@example.com`
-- (scripts/add-admin.ts, which uses the service role), never through the site.
create table public.admins (
  email text primary key check (email = lower(email))
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- True when the signed-in user's email is on the admins list. SECURITY DEFINER
-- so it can read admins (which nobody else can); search_path is emptied and
-- every reference is schema-qualified so the definer context cannot be hijacked.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins a
    where a.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admins may read every request and change only its status. Everyone else is
-- still limited to submitting a request (0003), and anon still reads nothing.
grant select on public.booking_requests to authenticated;
grant update (status) on public.booking_requests to authenticated;

create policy "admins read booking requests" on public.booking_requests
  for select to authenticated
  using ((select public.is_admin()));

create policy "admins update booking status" on public.booking_requests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- No double booking: at most one live (not cancelled) request per start time.
-- This is the authoritative guard; the booking page hiding taken times is UX.
create unique index booking_requests_one_live_per_time
  on public.booking_requests (starts_at)
  where status <> 'cancelled';

-- Which times are taken, without revealing who took them, so the public
-- booking page can hide them. Returns start instants only.
create function public.taken_booking_times(p_from timestamptz, p_to timestamptz)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select b.starts_at
  from public.booking_requests b
  where b.status <> 'cancelled'
    and b.starts_at >= p_from
    and b.starts_at < p_to
  order by b.starts_at;
$$;

revoke all on function public.taken_booking_times(timestamptz, timestamptz) from public;
grant execute on function public.taken_booking_times(timestamptz, timestamptz) to anon, authenticated;
