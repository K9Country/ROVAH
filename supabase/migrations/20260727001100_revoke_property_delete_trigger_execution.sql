-- Explicitly remove default function execution from API roles. The trigger is
-- invoked only by PostgreSQL during a property delete; it is not an API.
revoke all on function public.prevent_property_delete_when_reservations_exist() from public;
revoke execute on function public.prevent_property_delete_when_reservations_exist() from anon, authenticated;
