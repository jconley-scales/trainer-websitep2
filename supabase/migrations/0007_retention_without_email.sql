-- Keep the privacy promise for bookings that have no email (trainer-added
-- bookings, coming soon). 0005 grouped a client's bookings by email only, so a
-- row with a NULL email matched nothing and would have been deleted the first
-- night.
--
-- A client's bookings are now grouped by, in order:
--   1. the same email, ignoring case and surrounding spaces, if the row has one
--   2. otherwise the same phone number, comparing digits only
--      ("(555) 010-2030" and "555.010.2030" are one client)
--   3. otherwise nothing: the row stands alone
-- A booking is deleted once its group has no session starting within the last
-- two years. A group's "last session" is its latest start time.

-- Returns how many rows went. SECURITY DEFINER with an empty search_path,
-- like the other functions; only the scheduled job (from 0005) runs it.
create or replace function public.delete_expired_booking_requests()
returns integer
language sql
security definer
set search_path = ''
as $$
  with keyed as (
    select
      b.id,
      b.starts_at,
      case
        when c.email <> '' then 'email:' || c.email
        when c.phone_digits <> '' then 'phone:' || c.phone_digits
        else 'row:' || b.id::text
      end as client_key
    from public.booking_requests b
    cross join lateral (
      select
        lower(btrim(coalesce(b.email, ''))) as email,
        regexp_replace(coalesce(b.phone, ''), '[^0-9]', '', 'g') as phone_digits
    ) c
  ),
  expired_clients as (
    select client_key
    from keyed
    group by client_key
    having max(starts_at) <= now() - interval '2 years'
  ),
  expired as (
    delete from public.booking_requests b
    using keyed k
    join expired_clients e on e.client_key = k.client_key
    where b.id = k.id
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.delete_expired_booking_requests() from public, anon, authenticated;
