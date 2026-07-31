import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';

export const ROVAH_SERVICE_FEE_RATE = 0.18;

export type BookingWithHost = {
  id: string;
  guest_id: string;
  total_amount: number | string;
  status: string;
  start_at: string;
  properties: { host_id: string; name: string | null } | { host_id: string; name: string | null }[] | null;
};

export const stripeId = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id ?? null;

function propertyInfo(value: BookingWithHost['properties']) {
  const property = Array.isArray(value) ? value[0] : value;
  return { hostId: property?.host_id ?? null, name: property?.name ?? 'Private space' };
}

export async function getBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from('bookings')
    .select('id, guest_id, total_amount, status, start_at, properties(host_id, name)')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Booking not found');
  return data as BookingWithHost;
}

export async function markBookingAuthorized({
  admin,
  bookingId,
  checkoutSessionId,
  paymentIntentId,
  stripe,
}: {
  admin: SupabaseClient;
  bookingId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string;
  stripe: Stripe;
}) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status === 'succeeded') {
    return settleCapturedBooking({ admin, bookingId, checkoutSessionId, paymentIntentId, stripe });
  }
  if (paymentIntent.status !== 'requires_capture') {
    throw new Error('Stripe has not secured this payment yet');
  }

  const booking = await getBooking(admin, bookingId);
  const expectedAmount = Math.round(Number(booking.total_amount) * 100);
  if (expectedAmount <= 0 || paymentIntent.amount !== expectedAmount || paymentIntent.currency !== 'usd') {
    throw new Error('Stripe payment amount does not match the reservation total');
  }

  const now = new Date();
  const captureDueAt = new Date(new Date(booking.start_at).getTime() - 60 * 60 * 1000);
  const { error } = await admin
    .from('bookings')
    .update({
      status: 'confirmed',
      payment_status: 'authorized',
      payment_provider: 'stripe',
      payment_authorized_at: now.toISOString(),
      payment_capture_due_at: captureDueAt.toISOString(),
      payment_hold_expires_at: null,
      stripe_checkout_session_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntent.id,
      payment_updated_at: now.toISOString(),
    })
    .eq('id', bookingId)
    .in('status', ['payment_pending', 'confirmed']);
  if (error) throw error;
  return { propertyName: propertyInfo(booking.properties).name, totalAmount: Number(booking.total_amount), paymentStatus: 'authorized' as const };
}

/**
 * Records a successful Checkout Setup session for a reservation that is too
 * far in the future for a card-network authorization hold. The card is saved
 * with the member's explicit booking consent and charged off-session one hour
 * before the visit by capture-due-reservation-payments.
 */
export async function markBookingPaymentScheduled({
  admin,
  bookingId,
  checkoutSessionId,
  setupIntentId,
  stripe,
}: {
  admin: SupabaseClient;
  bookingId: string;
  checkoutSessionId: string;
  setupIntentId: string;
  stripe: Stripe;
}) {
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = stripeId(setupIntent.payment_method);
  const customerId = stripeId(setupIntent.customer);
  if (setupIntent.status !== 'succeeded' || !paymentMethodId || !customerId) {
    throw new Error('Stripe has not saved this card yet');
  }

  const booking = await getBooking(admin, bookingId);
  if (Number(booking.total_amount) <= 0) throw new Error('A payment card is not needed for this reservation');
  const now = new Date();
  const captureDueAt = new Date(new Date(booking.start_at).getTime() - 60 * 60 * 1000);
  const { error } = await admin
    .from('bookings')
    .update({
      status: 'confirmed',
      payment_status: 'scheduled',
      payment_provider: 'stripe',
      payment_setup_completed_at: now.toISOString(),
      payment_capture_due_at: captureDueAt.toISOString(),
      payment_hold_expires_at: null,
      stripe_checkout_session_id: checkoutSessionId,
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethodId,
      payment_updated_at: now.toISOString(),
    })
    .eq('id', bookingId)
    .in('status', ['payment_pending', 'confirmed']);
  if (error) throw error;
  return { propertyName: propertyInfo(booking.properties).name, totalAmount: Number(booking.total_amount), paymentStatus: 'scheduled' as const };
}

export async function settleCapturedBooking({
  admin,
  bookingId,
  checkoutSessionId,
  paymentIntentId,
  stripe,
}: {
  admin: SupabaseClient;
  bookingId: string;
  checkoutSessionId: string | null;
  paymentIntentId: string;
  stripe: Stripe;
}) {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  });
  if (paymentIntent.status !== 'succeeded') throw new Error('Stripe has not captured this payment yet');

  const chargeId = stripeId(paymentIntent.latest_charge);
  if (!chargeId) throw new Error('Stripe payment has no successful charge');
  const charge = typeof paymentIntent.latest_charge === 'string'
    ? await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] })
    : paymentIntent.latest_charge;
  const balanceTransactionId = stripeId(charge.balance_transaction);
  if (!balanceTransactionId) throw new Error('Stripe payment fee is not available yet');
  const balanceTransaction = typeof charge.balance_transaction === 'string'
    ? await stripe.balanceTransactions.retrieve(balanceTransactionId)
    : charge.balance_transaction;

  const booking = await getBooking(admin, bookingId);
  const { hostId, name } = propertyInfo(booking.properties);
  if (!hostId) throw new Error('Booking has no host payout recipient');
  const reservationTotalCents = Math.round(Number(booking.total_amount) * 100);
  if (reservationTotalCents <= 0 || paymentIntent.amount_received !== reservationTotalCents) {
    throw new Error('Stripe payment amount does not match the reservation total');
  }
  if (paymentIntent.currency !== 'usd' || balanceTransaction.currency !== 'usd') {
    throw new Error('Unsupported reservation currency');
  }

  const rovahServiceFeeCents = Math.round(reservationTotalCents * ROVAH_SERVICE_FEE_RATE);
  const stripeProcessingFeeCents = balanceTransaction.fee;
  const hostPayoutCents = reservationTotalCents - rovahServiceFeeCents - stripeProcessingFeeCents;
  if (hostPayoutCents < 0) throw new Error('Stripe fee exceeds the available host payout');

  // A refund or dispute reversal must never be overwritten by a repeated Stripe
  // success event. The booking can remain paid, but the settlement must retain
  // its reversed state so the monthly payout runner cannot pay it out again.
  const { data: existingSettlement, error: existingSettlementError } = await admin
    .from('booking_payout_settlements')
    .select('booking_id, settlement_status, stripe_balance_transaction_id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (existingSettlementError) throw existingSettlementError;
  if (existingSettlement?.settlement_status === 'reversed' || existingSettlement?.settlement_status === 'transfer_reversal_required') {
    throw new Error('This reservation payout has already been reversed');
  }
  if (existingSettlement?.stripe_balance_transaction_id && existingSettlement.stripe_balance_transaction_id !== balanceTransaction.id) {
    throw new Error('Reservation payment does not match its existing payout settlement');
  }

  const now = new Date().toISOString();
  if (!existingSettlement) {
    const { error: settlementError } = await admin
      .from('booking_payout_settlements')
      .insert({
        booking_id: bookingId,
        host_id: hostId,
        reservation_total_amount: reservationTotalCents / 100,
        rovah_service_fee_amount: rovahServiceFeeCents / 100,
        stripe_processing_fee_amount: stripeProcessingFeeCents / 100,
        host_payout_amount: hostPayoutCents / 100,
        currency: 'usd',
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: charge.id,
        stripe_balance_transaction_id: balanceTransaction.id,
        settlement_status: 'settled',
        finalized_at: now,
        updated_at: now,
      });
    if (settlementError) throw settlementError;
  }

  const { error: bookingError } = await admin
    .from('bookings')
    .update({
      status: 'confirmed',
      payment_status: 'paid',
      payment_provider: 'stripe',
      payment_captured_at: now,
      payment_hold_expires_at: null,
      stripe_checkout_session_id: checkoutSessionId,
      stripe_payment_intent_id: paymentIntent.id,
      payment_updated_at: now,
    })
    .eq('id', bookingId)
    .in('status', ['payment_pending', 'confirmed']);
  if (bookingError) throw bookingError;

  // A newly purchased subscription becomes usable only after Stripe has
  // actually captured the payment. This is a service-role-only database
  // operation; guests never activate credits from the client.
  const { error: activationError } = await admin.rpc('activate_member_loyalty_pass_after_payment', {
    p_booking_id: bookingId,
  });
  if (activationError) throw activationError;
  return { propertyName: name, totalAmount: Number(booking.total_amount), paymentStatus: 'paid' as const };
}
