import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';

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
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to cancel this reservation' }, 401);

  try {
    const { bookingId } = await req.json().catch(() => ({}));
    if (typeof bookingId !== 'string') return json({ error: 'A reservation is required' }, 400);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to cancel this reservation' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, guest_id, status, start_at, total_amount, payment_status, stripe_payment_intent_id, loyalty_pass_offer_id, member_loyalty_pass_id, loyalty_pass_credit_hours_applied, properties(host_id)')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    const property = Array.isArray(booking?.properties) ? booking?.properties[0] : booking?.properties;
    const isGuest = booking?.guest_id === user.id;
    const isHost = property?.host_id === user.id;
    if (!booking || (!isGuest && !isHost)) return json({ error: 'You do not have permission to cancel this reservation' }, 403);
    if (booking.status !== 'confirmed') return json({ error: 'This reservation is no longer available to cancel' }, 409);
    if (new Date(booking.start_at).getTime() <= Date.now() + 60 * 60 * 1000) {
      return json({ error: 'The cancellation window closed one hour before this visit.' }, 409);
    }

    const isSubscriptionReservation = Boolean(booking.member_loyalty_pass_id || booking.loyalty_pass_offer_id);
    if (!isSubscriptionReservation && booking.payment_status === 'paid') {
      return json({ error: 'Payment has already been captured, so this reservation can no longer be cancelled online.' }, 409);
    }

    if (!isSubscriptionReservation && booking.payment_status === 'authorized' && booking.stripe_payment_intent_id) {
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) return json({ error: 'Payments are not configured yet' }, 503);
      const stripe = new Stripe(stripeSecretKey);
      const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'requires_confirmation') {
        await stripe.paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'requested_by_customer' });
      } else if (paymentIntent.status === 'succeeded') {
        return json({ error: 'Payment has already been captured, so this reservation can no longer be cancelled online.' }, 409);
      }
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        payment_status: 'cancelled',
        payment_released_at: now,
        payment_updated_at: now,
      })
      .eq('id', booking.id)
      .eq('status', 'confirmed');
    if (updateError) throw updateError;

    // Restore any already-spent subscription credits when a confirmed visit is
    // cancelled before the one-hour cutoff. A newly purchased pass that never
    // reached payment capture remains cancelled instead.
    if (booking.member_loyalty_pass_id && Number(booking.loyalty_pass_credit_hours_applied) > 0) {
      const { data: pass, error: passError } = await admin
        .from('member_loyalty_passes')
        .select('credit_hours_total, credit_hours_remaining, status')
        .eq('id', booking.member_loyalty_pass_id)
        .maybeSingle();
      if (passError) throw passError;
      if (pass && (pass.status === 'active' || pass.status === 'exhausted')) {
        const { error: restoreError } = await admin
          .from('member_loyalty_passes')
          .update({
            credit_hours_remaining: Math.min(Number(pass.credit_hours_total), Number(pass.credit_hours_remaining) + Number(booking.loyalty_pass_credit_hours_applied)),
            status: 'active',
            updated_at: now,
          })
          .eq('id', booking.member_loyalty_pass_id);
        if (restoreError) throw restoreError;
      }
    }
    const { error: passCancelError } = await admin
      .from('member_loyalty_passes')
      .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .eq('purchase_booking_id', booking.id)
      .eq('status', 'payment_pending');
    if (passCancelError) throw passCancelError;

    return json({ cancelled: true, paymentReleased: Number(booking.total_amount) > 0 });
  } catch (error) {
    console.error('cancel-booking', error instanceof Error ? error.message : error);
    return json({ error: 'Unable to cancel this reservation. Please try again.' }, 500);
  }
});
