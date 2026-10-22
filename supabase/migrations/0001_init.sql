-- Client workout-booking portal: schema and row level security.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null check (role in ('client', 'trainer')),
  created_at timestamptz not null default now()
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  trainer_id uuid not null references public.profiles (id),
  location text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- One slot per trainer per start time; also makes seeding idempotent.
  unique (trainer_id, starts_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots (id),
  client_id uuid not null references public.profiles (id),
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- No double booking: at most one active booking per slot.
create unique index uniq_active_booking_per_slot
  on public.bookings (slot_id)
  where status = 'booked';

create index bookings_client_id_idx on public.bookings (client_id);

alter table public.profiles enable row level security;
alter table public.slots enable row level security;
alter table public.bookings enable row level security;

-- Table privileges: explicit so correctness does not depend on a project's
-- default grants (hosted and local differ). Nobody gets delete; anon gets nothing.
revoke all on public.profiles, public.slots, public.bookings from anon, authenticated;

grant select on public.profiles to authenticated;
-- Column-level: users may edit only their name and phone, never their role.
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.slots to authenticated;
grant select, insert, update on public.bookings to authenticated;

-- profiles: a user reads and updates only their own row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- slots: readable by any authenticated user.
create policy "slots_select_authenticated" on public.slots
  for select to authenticated
  using (true);

-- bookings: a client reads, creates and updates only their own bookings.
create policy "bookings_select_own" on public.bookings
  for select to authenticated
  using (client_id = (select auth.uid()));

create policy "bookings_insert_own" on public.bookings
  for insert to authenticated
  with check (client_id = (select auth.uid()));

create policy "bookings_update_own" on public.bookings
  for update to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

-- Availability without leaking who booked. A client cannot read other clients'
-- bookings (RLS above), so "which slots are free?" cannot be derived from the
-- bookings table on their side. This SECURITY DEFINER function reads bookings
-- as its owner but returns only slot rows -- never any booking or client data.
-- search_path is emptied and every reference is schema-qualified so the
-- definer context cannot be hijacked by objects in a caller-controlled schema.
create function public.available_slots(p_now timestamptz)
returns setof public.slots
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.slots s
  where s.starts_at > p_now
    and not exists (
      select 1
      from public.bookings b
      where b.slot_id = s.id
        and b.status = 'booked'
    )
  order by s.starts_at;
$$;

revoke all on function public.available_slots(timestamptz) from public, anon;
grant execute on function public.available_slots(timestamptz) to authenticated;
