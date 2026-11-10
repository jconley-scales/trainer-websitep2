-- Virtual training: two more session types, live over video. The ids match
-- lib/session-types.ts. Scheduling stays out of the database: the virtual
-- schedule, and the trainer's break between sessions, live in
-- lib/booking-availability.ts, and the one-live-booking-per-time index (0004),
-- taken_booking_times() (0009) and the per-email cap (0006, 0008) still
-- ignore the type.
--
-- Only the column's check changes; the public insert policy (0011) already
-- requires a type on every new website request.

alter table public.booking_requests
  drop constraint booking_requests_session_type_check;

alter table public.booking_requests
  add constraint booking_requests_session_type_check
  check (session_type in ('one-on-one', 'partner', 'virtual-one-on-one', 'virtual-partner'));
