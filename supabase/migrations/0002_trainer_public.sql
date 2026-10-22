-- Trainer names for client-facing screens.
--
-- profiles RLS lets a user read only their own row, so a client cannot read
-- their trainer's name. Rather than opening profiles to other users (which
-- would expose every column the caller selects, e.g. phone), this SECURITY
-- DEFINER function returns ONLY (id, full_name) for trainers. search_path is
-- emptied and every reference is schema-qualified so the definer context
-- cannot be hijacked by objects in a caller-controlled schema.
create function public.trainer_public()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.role = 'trainer'
  order by p.full_name;
$$;

revoke all on function public.trainer_public() from public, anon;
grant execute on function public.trainer_public() to authenticated;
