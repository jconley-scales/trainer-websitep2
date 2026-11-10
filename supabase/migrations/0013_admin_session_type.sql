-- The trainer records the session type on bookings they add at /admin, and can
-- set or change it when editing a booking. The ids match lib/session-types.ts;
-- the column's check (0012) still limits the values.
--
-- From now on every new row needs a type, website or admin. Rows made before
-- this migration may stay without one ("not recorded"): they are not
-- backfilled, and they can still be confirmed, cancelled and edited. Once a
-- booking has a type it cannot be cleared.

-- 1. Every row created from here on has a type. A check keyed on created_at
--    (rather than a BEFORE INSERT trigger) also lets an older, untyped row be
--    updated, since its created_at is before the cutoff. The cutoff is the
--    moment this migration runs, so no row slips through in between.
do $$
begin
  execute format(
    'alter table public.booking_requests
       add constraint booking_requests_session_type_required
       check (session_type is not null or created_at < %L::timestamptz)',
    now()
  );
end;
$$;

-- So that rule can't be dodged by backdating a new row, the public keys may
-- no longer set created_at (or id or updated_at) on insert: only the columns
-- a booking is made from. The insert policies (0008, 0011) are unchanged.
revoke insert on public.booking_requests from anon, authenticated;
grant insert (name, email, phone, note, starts_at, ends_at, status, source, session_type)
  on public.booking_requests to anon, authenticated;

-- 2. Admins may update the type, through the same "admins update bookings"
--    policy (0004, 0010) as the other editable fields. Still never source.
grant update (session_type) on public.booking_requests to authenticated;

-- 3. The edit trigger (0010) treats the type like the other details: changing
--    it stamps updated_at (the "Edited" tag), and is refused on a cancelled or
--    started booking (PF002). A type once recorded can't be cleared, even on
--    an older row the check above lets stay untyped; that raises a check
--    violation (23514), as clearing it on a newer row would.
create or replace function public.stamp_booking_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.name, new.email, new.phone, new.note, new.starts_at, new.ends_at, new.session_type)
     is not distinct from
     (old.name, old.email, old.phone, old.note, old.starts_at, old.ends_at, old.session_type) then
    return new;
  end if;

  if old.status = 'cancelled' or old.starts_at <= now() then
    raise exception 'Cancelled and past bookings cannot be edited'
      using errcode = 'PF002';
  end if;

  if old.session_type is not null and new.session_type is null then
    raise exception 'A booking''s session type cannot be cleared'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.stamp_booking_edit() from public, anon, authenticated;
