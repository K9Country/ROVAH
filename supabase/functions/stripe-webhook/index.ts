import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';
import { markBookingAuthorized, markBookingPaymentScheduled, settleCapturedBooking, stripeId } from '../_shared/booking-payments.ts';

async function cancelPendingLoyaltyPass(admin: ReturnType<typeof createClient>, bookingId: string) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from('member_loyalty_passes')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('purchase_booking_id', bookingId)
    .eq('status', 'payment_pending');
  if (error) throw error;
}

async function notifyReservationParties(bookingId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return;
  const response = await fetch(`${supabaseUrl}/functions/v1/notify-app-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'reservation_created', resourceId: bookingId }),
  });
  if (!response.ok) console.error('Reservation email notification failed', await response.text());
}

async function markSettlementReversed({
  admin,
  chargeId,
  reason,
}: {
  admin: ReturnType<typeof createClient>;
  chargeId: string;
  reason: 'refund' | 'dispute';
}) {
  const { data: settlement, error } = await admin
    .from('booking_payout_settlements')
    .select('booking_id, stripe_transfer_id, settlement_status')
    .eq('stripe_charge_id', chargeId)
    .maybeSingle();
  if (error) throw error;
  if (!settlement || settlement.settlement_status !== 'settled') return;

  const now = new Date().toISOString();
  const status = settlement.stripe_transfer_id ? 'transfer_reversal_required' : 'reversed';
  const { error: settlementError } = await admin
    .from('booking_payout_settlements')
    .update({ settlement_status: status, reversal_reason: reason, reversed_at: now, updated_at: now })
    .eq('booking_id', settlement.booking_id)
    .eq('settlement_status', 'settled');
  if (settlementError) throw settlementError;

  if (reason === 'refund') {
    const { error: bookingError } = await admin
      .from('bookings')
      .update({ payment_status: 'refunded', payment_updated_at: now })
      .eq('id', settlement.booking_id);
    if (bookingError) throw bookingError;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeSecretKey || !webhookSecret) return new Response('Webhook is not configured', { status: 503 });

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) return new Response('Missing Stripe signature', { status: 400 });
    const stripe = new Stripe(stripeSecretKey);
    const event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret);
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      const paymentIntentId = stripeId(session.payment_intent);
      if (bookingId && session.mode === 'setup') {
        const setupIntentId = stripeId(session.setup_intent);
        if (setupIntentId) {
          await markBookingPaymentScheduled({ admin, bookingId, checkoutSessionId: session.id, setupIntentId, stripe });
          await notifyReservationParties(bookingId);
        }
      } else if (bookingId && paymentIntentId) {
        await markBookingAuthorized({ admin, bookingId, checkoutSessionId: session.id, paymentIntentId, stripe });
        await notifyReservationParties(bookingId);
      }
      const promotionId = session.metadata?.local_promotion_id;
      if (promotionId && session.payment_status === 'paid') {
        const { error } = await admin.rpc('activate_site_promotion_after_payment', {
          p_promotion_id: promotionId,
          p_checkout_session_id: session.id,
          p_payment_intent_id: paymentIntentId,
        });
        if (error) throw error;
      }
    }

    if (event.type === 'payment_intent.amount_capturable_updated') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.booking_id;
      if (bookingId) {
        await markBookingAuthorized({ admin, bookingId, checkoutSessionId: null, paymentIntentId: paymentIntent.id, stripe });
        await notifyReservationParties(bookingId);
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.booking_id;
      if (bookingId) {
        await settleCapturedBooking({ admin, bookingId, checkoutSessionId: null, paymentIntentId: paymentIntent.id, stripe });
        await notifyReservationParties(bookingId);
      }
    }

    if (event.type === 'payment_intent.canceled') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.booking_id;
      if (bookingId) {
        const now = new Date().toISOString();
        const { error } = await admin.from('bookings').update({
          status: 'cancelled', payment_status: 'cancelled', payment_released_at: now, payment_updated_at: now,
        }).eq('id', bookingId).eq('payment_status', 'authorized');
        if (error) throw error;
        await cancelPendingLoyaltyPass(admin, bookingId);
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.booking_id;
      if (bookingId) {
        const now = new Date().toISOString();
        const { error } = await admin.from('bookings').update({
          status: 'cancelled', payment_status: 'failed', payment_updated_at: now,
        }).eq('id', bookingId).in('payment_status', ['scheduled', 'authorized']);
        if (error) throw error;
        await cancelPendingLoyaltyPass(admin, bookingId);
      }
    }

    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      if (bookingId) {
        const { error } = await admin.from('bookings').update({
          status: 'cancelled',
          payment_status: event.type === 'checkout.session.expired' ? 'cancelled' : 'failed',
          payment_released_at: new Date().toISOString(),
          payment_updated_at: new Date().toISOString(),
        }).eq('id', bookingId).eq('status', 'payment_pending').eq('payment_status', 'processing');
        if (error) throw error;
        await cancelPendingLoyaltyPass(admin, bookingId);
      }
      const promotionId = session.metadata?.local_promotion_id;
      if (promotionId) {
        const { error } = await admin.rpc('mark_site_promotion_payment_not_completed', {
          p_promotion_id: promotionId,
          p_checkout_session_id: session.id,
          p_reason: event.type === 'checkout.session.expired'
            ? 'Your $2 promotion payment expired before it was completed. No promotion was sent.'
            : 'Your $2 promotion payment was not completed. No promotion was sent.',
        });
        if (error) throw error;
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      if (charge.refunded) await markSettlementReversed({ admin, chargeId: charge.id, reason: 'refund' });
    }
    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = stripeId(dispute.charge);
      if (chargeId) await markSettlementReversed({ admin, chargeId, reason: 'dispute' });
    }
    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('stripe-webhook', error instanceof Error ? error.message : error);
    return new Response('Invalid webhook', { status: 400 });
  }
});
