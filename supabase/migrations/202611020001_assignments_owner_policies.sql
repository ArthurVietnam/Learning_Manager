-- Migration: 202611020001_assignments_owner_policies.sql
-- Description: Configure owner_id default and RLS policies for public.assignments (Lab 6)

-- 1. Set default owner_id to current authenticated user
alter table public.assignments
  alter column owner_id set default auth.uid();

-- 2. Restrict table operations to authenticated role only
revoke all on table public.assignments from anon, authenticated;
grant select, insert, update, delete
  on table public.assignments to authenticated;

-- 3. Owner policies for SELECT, INSERT, UPDATE, and DELETE
create policy "assignments select own"
on public.assignments for select to authenticated
using ((select auth.uid()) is not null
  and (select auth.uid()) = owner_id);

create policy "assignments insert own"
on public.assignments for insert to authenticated
with check ((select auth.uid()) is not null
  and (select auth.uid()) = owner_id);

create policy "assignments update own"
on public.assignments for update to authenticated
using ((select auth.uid()) is not null
  and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null
  and (select auth.uid()) = owner_id);

create policy "assignments delete own"
on public.assignments for delete to authenticated
using ((select auth.uid()) is not null
  and (select auth.uid()) = owner_id);
