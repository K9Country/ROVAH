create table public.booking_dogs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  dog_profile_id uuid references public.dog_profiles(id) on delete set null,
  name text not null,
  breed text not null default '',
  size text not null default '',
  behavior_traits text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (booking_id, dog_profile_id)
);

create index booking_dogs_booking_id_idx on public.booking_dogs(booking_id);

alter table public.booking_dogs enable row level security;

revoke all on table public.booking_dogs from anon, authenticated;
grant select on table public.booking_dogs to authenticated;

create policy "Members can view dog details for their own bookings"
on public.booking_dogs
for select
to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and exists (
    select 1
    from public.bookings
    where bookings.id = booking_dogs.booking_id
      and bookings.guest_id = (select auth.uid())
  )
);

create policy "Hosts can view dog details for reservations at their properties"
on public.booking_dogs
for select
to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and exists (
    select 1
    from public.bookings
    join public.properties on properties.id = bookings.property_id
    where bookings.id = booking_dogs.booking_id
      and properties.host_id = (select auth.uid())
  )
);

create or replace function public.create_booking_with_dogs(
  p_property_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_dog_profile_ids uuid[]
)
returns table (id uuid, total_amount numeric, payment_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_booking public.bookings;
  selected_dog_count integer;
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required to create a reservation';
  end if;

  if coalesce(cardinality(p_dog_profile_ids), 0) = 0 then
    raise exception 'Select at least one dog for this reservation';
  end if;

  select count(*)
  into selected_dog_count
  from public.dog_profiles
  where dog_profiles.user_id = (select auth.uid())
    and dog_profiles.id = any(p_dog_profile_ids);

  if selected_dog_count <> cardinality(p_dog_profile_ids) then
    raise exception 'Every selected dog must belong to your dog profiles';
  end if;

  insert into public.bookings (property_id, guest_id, start_at, end_at, dog_count)
  values (p_property_id, (select auth.uid()), p_start_at, p_end_at, selected_dog_count)
  returning * into created_booking;

  insert into public.booking_dogs (booking_id, dog_profile_id, name, breed, size, behavior_traits)
  select
    created_booking.id,
    dog_profiles.id,
    dog_profiles.name,
    dog_profiles.breed,
    dog_profiles.size,
    dog_profiles.behavior_traits
  from public.dog_profiles
  where dog_profiles.user_id = (select auth.uid())
    and dog_profiles.id = any(p_dog_profile_ids);

  return query
  select created_booking.id, created_booking.total_amount, created_booking.payment_status;
end;
$$;

revoke all on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[]) to authenticated;

revoke insert on table public.bookings from authenticated;
