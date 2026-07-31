import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';
import { getBooking, markBookingAuthorized, markBookingPaymentScheduled, stripeId } from '../_shared/booking-payments.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to confirm this reservation' }, 401);
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return json({ error: 'Payments are not configured yet' }, 503);

  try {
    const { sessionId } = await req.json().catch(() => ({}));
    if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return json({ error: 'A valid Stripe Checkout session is required' }, 400);
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to confirm this reservation' }, 401);

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const bookingId = session.metadata?.booking_id;
    if (!bookingId || session.status !== 'complete') {
      return json({ error: 'Stripe has not completed this checkout yet' }, 409);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const booking = await getBooking(admin, bookingId);
    if (booking.guest_id !== user.id) return json({ error: 'This payment does not belong to your reservation' }, 403);

    const result = session.mode === 'setup'
      ? await markBookingPaymentScheduled({
        admin,
        bookingId,
        checkoutSessionId: session.id,
        setupIntentId: stripeId(session.setup_intent) ?? '',
        stripe,
      })
      : await markBookingAuthorized({
        admin,
        bookingId,
        checkoutSessionId: session.id,
        paymentIntentId: stripeId(session.payment_intent) ?? '',
        stripe,
      });
    return json({ paymentStatus: result.paymentStatus, booking: { id: bookingId, propertyName: result.propertyName, totalAmount: result.totalAmount } });
  } catch (error) {
    console.error('confirm-booking-payment', error instanceof Error ? error.message : error);
    return json({ error: 'We could not confirm this payment yet. Please refresh My Reservations in a moment.' }, 500);
  }
});
