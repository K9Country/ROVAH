-- Removing a guest profile also removes that guest's upcoming reservations.
-- Deleting bookings activates the existing booking-block trigger, which
-- releases each corresponding property time slot immediately.

create or replace function public.release_upcoming_guest_bookings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.bookings
  where guest_id = old.user_id
    and start_at > now();

  return old;
end;
$$;

revoke all on function public.release_upcoming_guest_bookings() from public, anon, authenticated;

drop trigger if exists release_upcoming_guest_bookings_before_profile_delete on public.guest_profiles;
create trigger release_upcoming_guest_bookings_before_profile_delete
before delete on public.guest_profiles
for each row
execute function public.release_upcoming_guest_bookings();
