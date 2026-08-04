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

      try {
        const session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
        if (session.status !== 'complete') {
          results.push({ bookingId: booking.id, status: session.status });
          continue;
        }

        if (session.mode === 'setup') {
          const setupIntentId = stripeId(session.setup_intent);
          if (!setupIntentId) throw new Error('Completed Stripe setup session has no setup intent');
          await markBookingPaymentScheduled({
            admin,
            bookingId: booking.id,
            checkoutSessionId: session.id,
            setupIntentId,
            stripe,
          });
        } else {
          const paymentIntentId = stripeId(session.payment_intent);
          if (!paymentIntentId) throw new Error('Completed Stripe payment session has no payment intent');
          await markBookingAuthorized({
            admin,
            bookingId: booking.id,
            checkoutSessionId: session.id,
            paymentIntentId,
            stripe,
          });
        }
        await notifyReservationParties(booking.id);
        results.push({ bookingId: booking.id, status: 'confirmed' });
      } catch (bookingError) {
        console.error('reconcile-pending-booking-checkouts', booking.id, bookingError instanceof Error ? bookingError.message : bookingError);
        results.push({ bookingId: booking.id, status: 'reconciliation error' });
      }
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    console.error('reconcile-pending-booking-checkouts', error);
    return new Response('Unable to reconcile pending booking checkouts', { status: 500 });
  }
});
