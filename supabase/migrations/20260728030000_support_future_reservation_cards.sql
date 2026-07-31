-- Reservations beyond the card-network authorization window save a card with
-- the guest's consent, then charge it one hour before the visit.
alter table public.guest_profiles
  add column if not exists stripe_customer_id text;

alter table public.bookings
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists payment_setup_completed_at timestamptz,
  add column if not exists payment_consent_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in (
    'pending_configuration',
    'processing',
    'authorized',
    'scheduled',
    'paid',
    'refunded',
    'failed',
    'cancelled'
  ));

drop index if exists public.bookings_payment_capture_due_index;

create index if not exists bookings_payment_capture_due_index
  on public.bookings (payment_capture_due_at)
  where status = 'confirmed' and payment_status in ('authorized', 'scheduled');
