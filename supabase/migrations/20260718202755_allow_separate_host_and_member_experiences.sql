-- A person may maintain both a host profile and a member profile. The app's
-- selected sign-in experience controls navigation; RLS keeps each private
-- profile readable and writable only by its owner.

drop trigger if exists enforce_host_profile_account_type on public.host_profiles;
drop trigger if exists enforce_guest_profile_account_type on public.guest_profiles;
drop trigger if exists enforce_guest_booking_account_type on public.bookings;
drop trigger if exists assign_account_role_after_signup on auth.users;

drop function if exists private.enforce_profile_account_type();
drop function if exists private.enforce_guest_booking_account_type();
drop function if exists private.assign_account_role();

drop policy if exists "Hosts can view their own profile" on public.host_profiles;
drop policy if exists "Hosts can insert their own profile" on public.host_profiles;
drop policy if exists "Hosts can update their own profile" on public.host_profiles;
drop policy if exists "Members can view their own guest profile" on public.guest_profiles;
drop policy if exists "Members can create their own guest profile" on public.guest_profiles;
drop policy if exists "Members can update their own guest profile" on public.guest_profiles;
drop policy if exists "Members can delete their own guest profile" on public.guest_profiles;

drop table if exists public.account_roles;

create policy "Hosts can view their own profile"
on public.host_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Hosts can insert their own profile"
on public.host_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Hosts can update their own profile"
on public.host_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Members can view their own guest profile"
on public.guest_profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can create their own guest profile"
on public.guest_profiles
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can update their own guest profile"
on public.guest_profiles
for update
to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
)
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can delete their own guest profile"
on public.guest_profiles
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);
