-- A member may never create a reservation that has already begun, even if a
-- screen was open while time advanced or a client attempts a direct insert.
create or replace function public.prevent_past_reservation_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and new.start_at <= now() then
    raise exception 'Reservation start time must be in the future'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_past_reservation_start on public.bookings;
create trigger prevent_past_reservation_start
before insert on public.bookings
for each row
execute function public.prevent_past_reservation_start();
