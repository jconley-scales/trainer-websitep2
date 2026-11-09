-- The public calendar hides a slot when ANY live booking overlaps it, not
-- only one starting at the same moment. Admin bookings (0008) can start at
-- any quarter hour and run any length, so a 9:45 session must hide the 9:30
-- slot it covers.
--
-- taken_booking_times() now returns each live booking's start AND end, and
-- includes every booking that overlaps the window (one that started just
-- before p_from still covers the first slots). Still times only, never who.
-- The return type changes, so the function is dropped and recreated.

drop function public.taken_booking_times(timestamptz, timestamptz);

create function public.taken_booking_times(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.starts_at, b.ends_at
  from public.booking_requests b
  where b.status <> 'cancelled'
    and b.starts_at < p_to
    and b.ends_at > p_from
  order by b.starts_at;
$$;

revoke all on function public.taken_booking_times(timestamptz, timestamptz) from public;
grant execute on function public.taken_booking_times(timestamptz, timestamptz) to anon, authenticated;
