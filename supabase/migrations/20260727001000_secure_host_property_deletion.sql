-- A property must never be removed together with reservation history. This
-- database guard applies even if another server-side tool later attempts a
-- direct delete.
create or replace function public.prevent_property_delete_when_reservations_exist()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.bookings as booking
    where booking.property_id = old.id
    limit 1
  ) then
    raise exception 'This site can''t be deleted because it has reservations.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_property_delete_when_reservations_exist on public.properties;
create trigger prevent_property_delete_when_reservations_exist
before delete on public.properties
for each row
execute function public.prevent_property_delete_when_reservations_exist();

-- The trigger is intentionally not SECURITY DEFINER and is not exposed as a
-- callable public API. The authenticated Edge Function performs the ownership
-- check before issuing the delete; normal foreign-key cascades remove only
-- records that belong to the deleted reservation-free property.
revoke all on function public.prevent_property_delete_when_reservations_exist() from public;
