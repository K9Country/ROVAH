-- K9 Country host onboarding
-- Run this migration in the Supabase SQL Editor for the connected project.

create table if not exists public.host_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone_number text not null check (char_length(trim(phone_number)) between 7 and 32),
  city text not null check (char_length(trim(city)) between 2 and 120),
  state text not null check (char_length(trim(state)) between 2 and 80),
  confirms_property_control boolean not null default false,
  agrees_to_host_terms boolean not null default false,
  onboarding_status text not null default 'started'
    check (onboarding_status in ('started', 'submitted', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.host_profiles enable row level security;

grant select, insert, update on public.host_profiles to authenticated;

drop policy if exists "Hosts can read their own profile" on public.host_profiles;
create policy "Hosts can read their own profile"
on public.host_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Hosts can create their own profile" on public.host_profiles;
create policy "Hosts can create their own profile"
on public.host_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Hosts can update their own profile" on public.host_profiles;
create policy "Hosts can update their own profile"
on public.host_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

