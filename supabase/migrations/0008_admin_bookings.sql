-- Admin bookings: the trainer adds a booking at /admin for a client who
-- arranged it by phone or text. See docs/adr/0001-admin-bookings.md.
--
-- Every row now records where it came from (`source`): 'website' for requests
-- from the public /book page (all existing rows), 'admin' for the trainer's.
-- Admin bookings may have no email, are saved as confirmed, and are not
-- limited by the per-email cap (0006). The one-live-booking-per-time index
-- (0004) and taken_booking_times() cover them unchanged.

alter table public.booking_requests
  add column source text not null default 'website' check (source in ('website', 'admin'));

-- Email stays required for website requests: only the trainer may leave it out.
alter table public.booking_requests
  alter column email drop not null,
  add constraint booking_requests_email_required_from_website
    check (email is not null or source = 'admin');

-- Visitors (and any signed-in user) may still only submit a new website
-- request: not an admin booking, and not one that is already confirmed.
drop policy "anyone may submit a booking request" on public.booking_requests;

create policy "anyone may submit a booking request" on public.booking_requests
  for insert to anon, authenticated
  with check (source = 'website' and status = 'new');

-- Admins may add admin bookings. `is_admin()` (0004) checks the signed-in
-- email against the admins table; the table grant already allows the insert.
create policy "admins add admin bookings" on public.booking_requests
  for insert to authenticated
  with check ((select public.is_admin()) and source = 'admin');

-- The per-email cap is a guard against the public form being flooded, so it
-- applies to website requests only, and counts only website requests: the
-- trainer's bookings for a regular client never use up that client's own three.
create or replace function public.limit_live_requests_per_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source <> 'website' then
    return new;
  end if;

  -- Serialize inserts for the same email, so two requests sent at once
  -- cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('booking_requests:' || lower(btrim(new.email)), 0));

  if (
    select count(*)
    from public.booking_requests b
    where lower(btrim(b.email)) = lower(btrim(new.email))
      and b.source = 'website'
      and b.status <> 'cancelled'
      and b.starts_at > now()
  ) >= 3 then
    raise exception 'Too many waiting booking requests for this email address'
      using errcode = 'PF001';
  end if;

  return new;
end;
$$;

revoke all on function public.limit_live_requests_per_email() from public, anon, authenticated;
