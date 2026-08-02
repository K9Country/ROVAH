-- Explicit role grants are required because this project has broad historical
-- default privileges. RLS protects rows; these grants protect table access.
revoke all on table public.property_reservation_welcome_messages from public, anon, authenticated;
revoke all on table public.booking_welcome_messages from public, anon, authenticated;

grant select, insert, update on table public.property_reservation_welcome_messages to authenticated;
grant all on table public.property_reservation_welcome_messages, public.booking_welcome_messages to service_role;
