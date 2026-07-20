-- The validation function is attached to both bookings and booking_dogs.
-- Use the trigger relation ID to choose the appropriate row field.
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
  if tg_relid = 'public.bookings'::regclass then
    target_booking_id := new.id;
  else
    target_booking_id := new.booking_id;
  end if;

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
