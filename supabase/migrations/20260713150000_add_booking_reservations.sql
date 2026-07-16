-- Guest reservations for published private spaces.
-- The exclusion constraint prevents overlapping confirmed reservations,
-- including concurrent attempts to reserve the same time window.

create extension if not exists btree_gist;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  dog_count integer not null check (dog_count >= 1),
  hourly_rate numeric(10, 2) not null default 0 check (hourly_rate >= 0),
  additional_dog_hourly_rate numeric(10, 2) not null default 0 check (additional_dog_hourly_rate >= 0),
  total_amount numeric(10, 2) not null default 0 check (total_amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists bookings_property_start_index
  on public.bookings (property_id, start_at);

create index if not exists bookings_guest_start_index
  on public.bookings (guest_id, start_at desc);

alter table public.bookings
  add constraint bookings_no_overlapping_confirmed_reservations
  exclude using gist (
    property_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status = 'confirmed');

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

drop trigger if exists calculate_booking_total_before_insert on public.bookings;
create trigger calculate_booking_total_before_insert
before insert on public.bookings
for each row
execute function public.calculate_booking_total();

alter table public.bookings enable row level security;

create policy "Members can create their own bookings"
on public.bookings
for insert
to authenticated
with check ((select auth.uid()) = guest_id);

create policy "Members can view their own bookings"
on public.bookings
for select
to authenticated
using ((select auth.uid()) = guest_id);

create policy "Hosts can view bookings for their properties"
on public.bookings
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = bookings.property_id
      and properties.host_id = (select auth.uid())
  )
);

grant select, insert on public.bookings to authenticated;
