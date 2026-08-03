-- Before secure card setup was required, a small number of reservations were
-- marked confirmed without any payment provider or Stripe payment record.
-- They cannot be charged and must not continue to block availability.

update public.bookings
set
  status = 'cancelled',
  payment_status = 'cancelled',
  payment_released_at = now(),
  payment_updated_at = now()
where status = 'confirmed'
  and payment_status = 'pending_configuration'
  and payment_provider is null
  and stripe_checkout_session_id is null
  and stripe_payment_intent_id is null
  and stripe_payment_method_id is null;
