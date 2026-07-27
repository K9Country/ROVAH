-- Paid reservations must hold their time while Checkout is open, rather than
-- becoming confirmed before Stripe reports a successful payment. Courtesy
-- Waivers explicitly create confirmed $0 reservations and are unaffected.
alter table public.bookings
  alter column status set default 'payment_pending';

-- Keep the monthly aggregate payout record mathematically reconcilable with
-- the immutable per-booking settlement ledger.
alter table public.host_payouts
  drop constraint if exists host_payouts_reconciles;

alter table public.host_payouts
  add constraint host_payouts_reconciles
  check (gross_amount = platform_fee_amount + stripe_processing_fee_amount + payout_amount);
