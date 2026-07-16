-- K9 Country host profiles
-- This reconciles the local project with the host_profiles schema created in
-- Supabase. It is safe to run after the original table and onboarding-fields
-- scripts because every structural change is conditional.

create extension if not exists pgcrypto;

create table if not exists public.host_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  city text,
  state text,
  controls_property boolean not null default false,
  accepted_host_terms_at timestamptz,
  onboarding_completed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'rejected')),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.host_profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists controls_property boolean not null default false,
  add column if not exists accepted_host_terms_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'host_profiles_status_check'
  ) then
    alter table public.host_profiles
      add constraint host_profiles_status_check
      check (status in ('pending', 'active', 'suspended', 'rejected'));
  end if;
end;
$$;

create unique index if not exists host_profiles_user_id_unique
  on public.host_profiles (user_id);

create index if not exists host_profiles_active_index
  on public.host_profiles (is_active);

create index if not exists host_profiles_location_index
  on public.host_profiles (state, city);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_host_profiles_updated_at on public.host_profiles;

create trigger set_host_profiles_updated_at
before update on public.host_profiles
for each row
execute function public.set_updated_at();

alter table public.host_profiles enable row level security;
alter table public.host_profiles force row level security;

drop policy if exists "Hosts can read their own profile" on public.host_profiles;
drop policy if exists "Hosts can create their own profile" on public.host_profiles;
drop policy if exists "Hosts can view their own profile" on public.host_profiles;
drop policy if exists "Hosts can insert their own profile" on public.host_profiles;
drop policy if exists "Hosts can update their own profile" on public.host_profiles;

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

-- Host onboarding may only write applicant-provided fields. Verification,
-- activation, and status are controlled by a future admin-only workflow.
revoke all on table public.host_profiles from anon;
revoke all on table public.host_profiles from authenticated;

grant select on table public.host_profiles to authenticated;
grant insert (
  user_id,
  full_name,
  email,
  phone,
  city,
  state,
  controls_property,
  accepted_host_terms_at,
  onboarding_completed_at
) on public.host_profiles to authenticated;
grant update (
  full_name,
  email,
  phone,
  city,
  state,
  controls_property,
  accepted_host_terms_at,
  onboarding_completed_at
) on public.host_profiles to authenticated;

grant all on table public.host_profiles to service_role;
