-- Keep the privacy page's promise (SITE.privacy in lib/site.ts): booking
-- requests are deleted two years after a person's last session. "Last
-- session" is the latest start time of any request with the same email, so a
-- long-term client's early bookings stay until two years after they stop.
-- Copies of the booking emails in the trainer's inbox are not touched here.

-- Deletes every request whose email has no request starting within the last
-- two years. Returns how many rows went. SECURITY DEFINER with an empty
-- search_path, like the other functions; only the scheduled job runs it.
create function public.delete_expired_booking_requests()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    delete from public.booking_requests b
    where not exists (
      select 1
      from public.booking_requests r
      where lower(r.email) = lower(b.email)
        and r.starts_at > now() - interval '2 years'
    )
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.delete_expired_booking_requests() from public, anon, authenticated;

-- Run it every night at 03:17 UTC. Scheduling under an existing job name
-- replaces that job, so re-running this is harmless.
create extension if not exists pg_cron;

select cron.schedule(
  'delete-expired-booking-requests',
  '17 3 * * *',
  $$select public.delete_expired_booking_requests()$$
);
