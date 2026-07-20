-- A K9 Country login belongs to exactly one experience: member or host.
-- The choice is made at account creation and cannot be switched from the app.

create table if not exists public.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('member', 'host')),
  created_at timestamptz not null default now()
);

alter table public.account_roles enable row level security;
alter table public.account_roles force row level security;

revoke all on table public.account_roles from anon;
revoke all on table public.account_roles from authenticated;
grant select, insert on table public.account_roles to authenticated;
grant all on table public.account_roles to service_role;

drop policy if exists "Users can read their own account role" on public.account_roles;
drop policy if exists "Users can choose their account role once" on public.account_roles;

create policy "Users can read their own account role"
on public.account_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can choose their account role once"
on public.account_roles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Preserve existing accounts without deleting their data. If an older account
-- has both profiles, its first-created profile determines its single experience.
insert into public.account_roles (user_id, account_type)
select
  u.id,
  case
    when hp.user_id is not null and gp.user_id is null then 'host'
    when gp.user_id is not null and hp.user_id is null then 'member'
    when hp.created_at <= gp.created_at then 'host'
    else 'member'
  end
from auth.users u
left join public.host_profiles hp on hp.user_id = u.id
left join public.guest_profiles gp on gp.user_id = u.id
where hp.user_id is not null or gp.user_id is not null
on conflict (user_id) do nothing;

create schema if not exists private;

create or replace function private.enforce_profile_account_type()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  assigned_type text;
begin
  select account_type
  into assigned_type
  from public.account_roles
  where user_id = new.user_id;

  if assigned_type is distinct from tg_argv[0] then
    raise exception 'This account is registered for the % experience.', coalesce(assigned_type, 'selected');
  end if;

  return new;
end;
$$;

create or replace function private.enforce_member_booking_account_type()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  assigned_type text;
begin
  select account_type
  into assigned_type
  from public.account_roles
  where user_id = new.guest_id;

  if assigned_type is distinct from 'member' then
    raise exception 'Only member accounts can make reservations.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_host_profile_account_type on public.host_profiles;
create trigger enforce_host_profile_account_type
before insert or update on public.host_profiles
for each row execute function private.enforce_profile_account_type('host');

drop trigger if exists enforce_guest_profile_account_type on public.guest_profiles;
create trigger enforce_guest_profile_account_type
before insert or update on public.guest_profiles
for each row execute function private.enforce_profile_account_type('member');

drop trigger if exists enforce_guest_booking_account_type on public.bookings;
create trigger enforce_guest_booking_account_type
before insert or update of guest_id on public.bookings
for each row execute function private.enforce_member_booking_account_type();

drop policy if exists "Hosts can view their own profile" on public.host_profiles;
drop policy if exists "Hosts can insert their own profile" on public.host_profiles;
drop policy if exists "Hosts can update their own profile" on public.host_profiles;

create policy "Hosts can view their own profile"
on public.host_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'host'
  )
);

create policy "Hosts can insert their own profile"
on public.host_profiles
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'host'
  )
);

create policy "Hosts can update their own profile"
on public.host_profiles
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'host'
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'host'
  )
);

drop policy if exists "Members can view their own guest profile" on public.guest_profiles;
drop policy if exists "Members can create their own guest profile" on public.guest_profiles;
drop policy if exists "Members can update their own guest profile" on public.guest_profiles;
drop policy if exists "Members can delete their own guest profile" on public.guest_profiles;

create policy "Members can view their own guest profile"
on public.guest_profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'member'
  )
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can create their own guest profile"
on public.guest_profiles
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'member'
  )
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can update their own guest profile"
on public.guest_profiles
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'member'
  )
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'member'
  )
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can delete their own guest profile"
on public.guest_profiles
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.account_roles
    where user_id = (select auth.uid()) and account_type = 'member'
  )
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);
