-- The trainer can edit or move a live, future booking (website or admin) at
-- /admin: its name, email, phone, note, start and end. Cancelled and past
-- bookings stay read-only. `source` never changes. No audit table: the row
-- records only when it was last edited (`updated_at`), shown as "Edited".
--
-- The checks that already apply to every row hold for edits unchanged: email
-- is still required unless source = 'admin' (0008), and the one-live-booking-
-- per-time index (0004) still blocks a move onto a taken start. The per-email
-- cap (0006, 0008) is a BEFORE INSERT trigger, so it never blocks an edit,
-- e.g. correcting an email onto a client who already has three requests.

-- Null until a booking's details or time are first edited.
alter table public.booking_requests add column updated_at timestamptz;

-- Admins may now update these columns as well as status (0004). Not source,
-- updated_at, created_at or id: those are never set through the site.
grant update (name, email, phone, note, starts_at, ends_at) on public.booking_requests to authenticated;

-- The 0004 policy already limits every update to admins; renamed now that it
-- covers more than the status.
alter policy "admins update booking status" on public.booking_requests rename to "admins update bookings";

-- Stamp updated_at when the details or time change (a status change alone,
-- e.g. confirming, is not an edit), and refuse to edit a cancelled booking or
-- one that has already started. The server action checks both too; this holds
-- for anything posted straight to the database. Raises PF002.
create function public.stamp_booking_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.name, new.email, new.phone, new.note, new.starts_at, new.ends_at)
     is not distinct from
     (old.name, old.email, old.phone, old.note, old.starts_at, old.ends_at) then
    return new;
  end if;

  if old.status = 'cancelled' or old.starts_at <= now() then
    raise exception 'Cancelled and past bookings cannot be edited'
      using errcode = 'PF002';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.stamp_booking_edit() from public, anon, authenticated;

create trigger booking_requests_stamp_edit
  before update on public.booking_requests
  for each row execute function public.stamp_booking_edit();
