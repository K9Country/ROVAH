-- Remove any broader booking update permission before restoring only the
-- status column needed by the guest cancellation policy.

revoke update on table public.bookings from authenticated;
grant update (status) on table public.bookings to authenticated;
