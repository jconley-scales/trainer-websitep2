-- Session type: a visitor chooses 1-on-1 or Partner training when requesting
-- a session on /book. The ids match lib/session-types.ts.
--
-- Nullable: rows made before this have no type ("not recorded") and are not
-- backfilled. Scheduling is unchanged for both types: the same slots, the
-- one-live-booking-per-time index (0004), taken_booking_times() (0009) and
-- the per-email cap (0006, 0008) all ignore the type.

alter table public.booking_requests
  add column session_type text check (session_type in ('one-on-one', 'partner'));

-- A new website request must say which kind of session it is. Enforced in the
-- public insert policy rather than a check constraint, so it applies to new
-- requests only: a check would also run on every update, and refuse to
-- confirm, cancel or edit an older request that has no type. Admin bookings
-- (source = 'admin') may still leave it out.
drop policy "anyone may submit a booking request" on public.booking_requests;

create policy "anyone may submit a booking request" on public.booking_requests
  for insert to anon, authenticated
  with check (source = 'website' and status = 'new' and session_type is not null);
