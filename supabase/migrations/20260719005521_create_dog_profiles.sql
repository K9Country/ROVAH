-- Private dog profiles belong to a member's private profile and are never
-- exposed to hosts or other members without an explicit future booking flow.
create table public.dog_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.guest_profiles(user_id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  breed text not null default '',
  age text not null default '',
  size text not null default '',
  temperament text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dog_profiles_user_id_idx on public.dog_profiles(user_id);

alter table public.dog_profiles enable row level security;

create policy "Members manage their own dog profiles"
on public.dog_profiles
for all
to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
)
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

grant select, insert, update, delete on public.dog_profiles to authenticated;

create trigger set_dog_profiles_updated_at
before update on public.dog_profiles
for each row
execute function public.set_updated_at();
