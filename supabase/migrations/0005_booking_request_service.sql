-- Which service a visitor chose when requesting a time (the ids of SITE.services
-- in lib/site.ts). Nullable so requests made before this column existed stay
-- valid. The public keys already have table-level insert on booking_requests
-- (0003), so the column needs no extra grant and still cannot be read back.
alter table public.booking_requests
  add column if not exists service text
  check (service in ('one-to-one', 'starter', 'small-group'));
