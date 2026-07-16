-- Messaging identifies the person on the other side of a conversation without
-- exposing phone numbers, email addresses, or other private profile data.
create table public.messaging_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.messaging_profiles (user_id, display_name)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(email, '@', 1), ''),
    'K9 Country Member'
  )
from auth.users
on conflict (user_id) do nothing;

alter table public.messaging_profiles enable row level security;

create policy "Authenticated members can view messaging display names"
on public.messaging_profiles
for select
to authenticated
using (true);

create policy "Members can add their own messaging profile"
on public.messaging_profiles
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Members can update their own messaging profile"
on public.messaging_profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table public.messaging_profiles from anon;
grant select, insert, update on table public.messaging_profiles to authenticated;
grant all on table public.messaging_profiles to service_role;

drop policy if exists "Hosts can start a conversation for a confirmed booking"
on public.property_conversations;
