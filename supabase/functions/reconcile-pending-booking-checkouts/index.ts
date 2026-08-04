import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';
import { markBookingAuthorized, markBookingPaymentScheduled, stripeId } from '../_shared/booking-payments.ts';

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const schedulerSecret = Deno.env.get('PAYOUT_RUNNER_SECRET');
  if (!schedulerSecret || req.headers.get('x-payment-capture-secret') !== schedulerSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return new Response('Stripe is not configured', { status: 503 });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: bookings, error } = await admin
      .from('bookings')
      .select('id, stripe_checkout_session_id')
      .eq('status', 'payment_pending')
      .eq('payment_status', 'processing')
      .not('stripe_checkout_session_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;

    const stripe = new Stripe(stripeSecretKey);
    const results: Array<{ bookingId: string; status: string }> = [];
    for (const booking of bookings ?? []) {
      if (!booking.stripe_checkout_session_id) continue;

      let stage = 'retrieve Checkout session';
      try {
        const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
        if (session.status !== 'complete') {
          results.push({ bookingId: booking.id, status: session.status });
          continue;
        }

        if (session.mode === 'setup') {
          stage = 'read saved-card setup intent';
          const setupIntentId = stripeId(session.setup_intent);
          if (!setupIntentId) throw new Error('Completed Stripe setup session has no setup intent');
          stage = 'confirm reservation from saved card';
          await markBookingPaymentScheduled({
            admin,
            bookingId: booking.id,
            checkoutSessionId: session.id,
            setupIntentId,
            stripe,
          });
        } else {
          stage = 'read Stripe payment intent';
          const paymentIntentId = stripeId(session.payment_intent);
          if (!paymentIntentId) throw new Error('Completed Stripe payment session has no payment intent');
          stage = 'confirm reservation from payment';
          await markBookingAuthorized({
            admin,
            bookingId: booking.id,
            checkoutSessionId: session.id,
            paymentIntentId,
            stripe,
          });
        }
        stage = 'notify reservation parties';
        await notifyReservationParties(booking.id);
        results.push({ bookingId: booking.id, status: 'confirmed' });
      } catch (bookingError) {
        const message = bookingError instanceof Error
          ? bookingError.message
          : typeof bookingError === 'object' && bookingError && 'message' in bookingError
            ? String(bookingError.message)
            : String(bookingError);
        console.error('reconcile-pending-booking-checkouts', booking.id, message);
        // This response is available only to the protected scheduler and lets
        // operations identify a Stripe-side state mismatch without logging
        // card or customer details.
        results.push({ bookingId: booking.id, status: `reconciliation error at ${stage}: ${message}` });
      }
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    console.error('reconcile-pending-booking-checkouts', error);
    return new Response('Unable to reconcile pending booking checkouts', { status: 500 });
  }
});
