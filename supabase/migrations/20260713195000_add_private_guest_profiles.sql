-- Private member profiles. These details are used to complete a reservation
-- but are never exposed to hosts or other members.

create table if not exists public.guest_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  postal_code text not null default '',
  dog_count smallint not null default 1 check (dog_count between 1 and 20),
  dog_details text not null default '',
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guest_profiles enable row level security;

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

grant select, insert, update, delete on public.guest_profiles to authenticated;

drop trigger if exists set_guest_profiles_updated_at on public.guest_profiles;
create trigger set_guest_profiles_updated_at
before update on public.guest_profiles
for each row
execute function public.set_updated_at();

-- The database is the final guard: a permanent member cannot create a
-- reservation until their private profile has been completed.
create or replace function public.calculate_booking_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  published_hourly_rate numeric(10, 2);
  visit_hours numeric;
begin
  if new.guest_id <> (select auth.uid()) then
    raise exception 'Bookings must belong to the signed-in member';
  end if;

  if not exists (
    select 1
    from public.guest_profiles
    where user_id = new.guest_id
      and profile_completed_at is not null
  ) then
    raise exception 'Complete your guest profile before reserving a private space';
  end if;

  select properties.price_per_hour
  into published_hourly_rate
  from public.properties
  where properties.id = new.property_id
    and properties.is_published = true;

  if published_hourly_rate is null then
    raise exception 'This property is not available for booking';
  end if;

  visit_hours := extract(epoch from (new.end_at - new.start_at)) / 3600;

  new.hourly_rate := published_hourly_rate;
  new.additional_dog_hourly_rate := published_hourly_rate * 0.5;
  new.total_amount := round(
    visit_hours * (
      published_hourly_rate + greatest(new.dog_count - 1, 0) * published_hourly_rate * 0.5
    ),
    2
  );

  return new;
end;
$$;
