grant insert (property_id, guest_id, start_at, end_at, dog_count)
  on table public.bookings to authenticated;
grant insert on table public.booking_dogs to authenticated;

create policy "Members can attach their own dogs to upcoming bookings"
on public.booking_dogs
for insert
to authenticated
with check (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and exists (
    select 1
    from public.bookings
    where bookings.id = booking_dogs.booking_id
      and bookings.guest_id = (select auth.uid())
      and bookings.status = 'confirmed'
      and bookings.start_at > now()
  )
  and exists (
    select 1
    from public.dog_profiles
    where dog_profiles.id = booking_dogs.dog_profile_id
      and dog_profiles.user_id = (select auth.uid())
  )
);

create or replace function public.snapshot_booking_dog()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select name, breed, size, behavior_traits
  into new.name, new.breed, new.size, new.behavior_traits
  from public.dog_profiles
  where dog_profiles.id = new.dog_profile_id
    and dog_profiles.user_id = (select auth.uid());

  if not found then
    raise exception 'Selected dog profile is unavailable';
  end if;

  return new;
end;
$$;

drop trigger if exists snapshot_booking_dog_before_insert on public.booking_dogs;
create trigger snapshot_booking_dog_before_insert
before insert on public.booking_dogs
for each row execute function public.snapshot_booking_dog();

create or replace function public.validate_booking_dog_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_booking_id uuid;
  expected_dog_count integer;
  attached_dog_count integer;
begin
  target_booking_id := case when tg_table_name = 'bookings' then new.id else new.booking_id end;

  select dog_count
  into expected_dog_count
  from public.bookings
  where bookings.id = target_booking_id;

  select count(*)
  into attached_dog_count
  from public.booking_dogs
  where booking_dogs.booking_id = target_booking_id;

  if expected_dog_count <> attached_dog_count then
    raise exception 'Every reservation must include exactly one saved dog profile for each attending dog';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_booking_dogs_after_booking_insert on public.bookings;
create constraint trigger validate_booking_dogs_after_booking_insert
after insert on public.bookings
deferrable initially deferred
for each row execute function public.validate_booking_dog_count();

drop trigger if exists validate_booking_dogs_after_dog_insert on public.booking_dogs;
create constraint trigger validate_booking_dogs_after_dog_insert
after insert on public.booking_dogs
deferrable initially deferred
for each row execute function public.validate_booking_dog_count();

create or replace function public.create_booking_with_dogs(
  p_property_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_dog_profile_ids uuid[]
)
returns table (id uuid, total_amount numeric, payment_status text)
language plpgsql
security invoker
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

  insert into public.booking_dogs (booking_id, dog_profile_id, name)
  select created_booking.id, dog_profiles.id, dog_profiles.name
  from public.dog_profiles
  where dog_profiles.user_id = (select auth.uid())
    and dog_profiles.id = any(p_dog_profile_ids);

  return query
  select created_booking.id, created_booking.total_amount, created_booking.payment_status;
end;
$$;

revoke all on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[]) to authenticated;
