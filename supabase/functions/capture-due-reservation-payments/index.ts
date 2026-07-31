import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';
import { settleCapturedBooking } from '../_shared/booking-payments.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  // The existing payout runner and this capture runner share one server-only
  // scheduler secret. It is never exposed to the browser.
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
      .select('id, total_amount, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id, stripe_payment_method_id, payment_status')
      .eq('status', 'confirmed')
      .in('payment_status', ['authorized', 'scheduled'])
      .lte('payment_capture_due_at', new Date().toISOString())
      .order('payment_capture_due_at', { ascending: true })
      .limit(50);
    if (error) throw error;

    const stripe = new Stripe(stripeSecretKey);
    const results: Array<{ bookingId: string; status: string }> = [];
    for (const booking of bookings ?? []) {
      try {
        let paymentIntent: Stripe.PaymentIntent;
        if (booking.payment_status === 'scheduled') {
          if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
            const now = new Date().toISOString();
            await admin.from('bookings').update({ status: 'cancelled', payment_status: 'failed', payment_updated_at: now })
              .eq('id', booking.id).eq('payment_status', 'scheduled');
            results.push({ bookingId: booking.id, status: 'missing saved card' });
            continue;
          }
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(Number(booking.total_amount) * 100),
            currency: 'usd',
            customer: booking.stripe_customer_id,
            payment_method: booking.stripe_payment_method_id,
            confirm: true,
            off_session: true,
            metadata: { booking_id: booking.id },
          }, { idempotencyKey: `rovah-reservation-charge-${booking.id}` });
        } else {
          if (!booking.stripe_payment_intent_id) {
            results.push({ bookingId: booking.id, status: 'missing payment intent' });
            continue;
          }
          paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
          if (paymentIntent.status === 'requires_capture') {
            paymentIntent = await stripe.paymentIntents.capture(paymentIntent.id, undefined, {
              idempotencyKey: `rovah-reservation-capture-${booking.id}`,
            });
          }
        }
        if (paymentIntent.status === 'succeeded') {
          await settleCapturedBooking({
            admin,
            bookingId: booking.id,
            checkoutSessionId: booking.stripe_checkout_session_id,
            paymentIntentId: paymentIntent.id,
            stripe,
          });
          results.push({ bookingId: booking.id, status: 'captured' });
          continue;
        }

        const now = new Date().toISOString();
        await admin.from('bookings').update({
          status: 'cancelled',
          payment_status: 'failed',
          payment_updated_at: now,
        }).eq('id', booking.id).in('payment_status', ['authorized', 'scheduled']);
        results.push({ bookingId: booking.id, status: `not capturable: ${paymentIntent.status}` });
      } catch (captureError) {
        console.error('capture-due-reservation-payments', booking.id, captureError instanceof Error ? captureError.message : captureError);
        results.push({ bookingId: booking.id, status: 'capture error' });
      }
    }
    return Response.json({ processed: results.length, results });
  } catch (error) {
    console.error('capture-due-reservation-payments', error);
    return new Response('Unable to process due reservation payments', { status: 500 });
  }
});
