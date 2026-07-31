-- Reservation payments are authorized at checkout, then captured by the
-- protected worker at the one-hour mark. A browser must never be able to mark
-- a booking cancelled without releasing the Stripe authorization.

alter table public.bookings
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists payment_capture_due_at timestamptz,
  add column if not exists payment_captured_at timestamptz,
  add column if not exists payment_released_at timestamptz;

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in (
    'pending_configuration', 'processing', 'authorized', 'paid', 'refunded',
    'failed', 'cancelled'
  ));

create index if not exists bookings_payment_capture_due_index
  on public.bookings (payment_capture_due_at)
  where status = 'confirmed' and payment_status = 'authorized';

-- All paid reservation cancellations go through cancel-booking Edge Function.
drop policy if exists "Members can cancel their own upcoming bookings" on public.bookings;
drop policy if exists "Hosts can cancel upcoming bookings for their properties" on public.bookings;
revoke update (status) on public.bookings from authenticated;
