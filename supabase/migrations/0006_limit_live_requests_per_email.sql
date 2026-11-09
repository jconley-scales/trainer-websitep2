-- Stop one person or script from filling the calendar: each email address may
-- hold at most 3 live (not cancelled) requests for future sessions at a time.
-- Enforced here, not only in the app, because the insert is reachable by
-- direct POST with the public anon key. Past and cancelled requests don't
-- count, so regular clients can keep booking as sessions go by.
--
-- submitBooking (app/(marketing)/book/actions.ts) turns error code PF001 into
-- a friendly message. Keep the code and the limit in step with it.

create index booking_requests_live_email_idx
  on public.booking_requests (lower(btrim(email)), starts_at)
  where status <> 'cancelled';

-- SECURITY DEFINER so it can count rows the anon role cannot read; empty
-- search_path and schema-qualified names, like the other functions.
create function public.limit_live_requests_per_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize inserts for the same email, so two requests sent at once
  -- cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('booking_requests:' || lower(btrim(new.email)), 0));

  if (
    select count(*)
    from public.booking_requests b
    where lower(btrim(b.email)) = lower(btrim(new.email))
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

create trigger booking_requests_limit_per_email
  before insert on public.booking_requests
  for each row execute function public.limit_live_requests_per_email();
