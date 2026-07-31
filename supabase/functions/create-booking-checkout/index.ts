import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Checkout must always return to the canonical production domain. This value
// is server-owned so a browser cannot redirect payment results elsewhere.
const appUrl = 'https://rovah.dog';
const termsVersion = '2026-07-27';
const waiverVersion = '2026-07-27';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to reserve this space' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to reserve this space' }, 401);

    const body = await req.json();
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : null;
    const startAt = typeof body.startAt === 'string' ? body.startAt : null;
    const endAt = typeof body.endAt === 'string' ? body.endAt : null;
    const dogProfileIds = Array.isArray(body.dogProfileIds) && body.dogProfileIds.every((id: unknown) => typeof id === 'string')
      ? body.dogProfileIds
      : null;
    const courtesyVisitCreditId = typeof body.courtesyVisitCreditId === 'string' ? body.courtesyVisitCreditId : null;
    const resolutionDiscountOfferId = typeof body.resolutionDiscountOfferId === 'string' ? body.resolutionDiscountOfferId : null;
    const loyaltyPassOfferId = typeof body.loyaltyPassOfferId === 'string' ? body.loyaltyPassOfferId : null;

    if (!propertyId || !startAt || !endAt || !dogProfileIds?.length) {
      return json({ error: 'Reservation details are incomplete' }, 400);
    }

    // Card authorizations are time-limited by the card networks. Visits inside
    // that window use an authorization hold; future visits use Checkout's
    // secure card-saving flow and are charged one hour before the visit.
    const visitStart = new Date(startAt);
    const latestSecureBookingStart = Date.now() + 6 * 24 * 60 * 60 * 1000;
    if (Number.isNaN(visitStart.getTime())) return json({ error: 'Choose a valid visit time' }, 400);
    const needsScheduledCard = visitStart.getTime() > latestSecureBookingStart;

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // A reservation is blocked until the member has accepted the currently
    // published Terms and Liability Waiver. New accounts are recorded by the
    // signup trigger; existing accounts use the in-app acceptance screen.
    const { data: currentAcceptances, error: acceptanceError } = await adminClient
      .from('user_legal_acceptances')
      .select('document_key, document_version')
      .eq('user_id', user.id)
      .in('document_key', ['terms_of_service', 'liability_waiver_release']);
    if (acceptanceError) throw acceptanceError;
    const hasCurrentTerms = currentAcceptances?.some((record) => record.document_key === 'terms_of_service' && record.document_version === termsVersion);
    const hasCurrentWaiver = currentAcceptances?.some((record) => record.document_key === 'liability_waiver_release' && record.document_version === waiverVersion);
    if (!hasCurrentTerms || !hasCurrentWaiver) {
      return json({
        code: 'legal_acceptance_required',
        error: 'Review and accept the current ROVAH Terms and Liability Waiver before making a reservation.',
      }, 403);
    }

    await adminClient
      .from('bookings')
      .update({ status: 'cancelled', payment_status: 'cancelled', payment_updated_at: new Date().toISOString() })
      .eq('status', 'payment_pending')
      .lt('payment_hold_expires_at', new Date().toISOString());

    // A site cannot accept a reservation until an administrator has approved
    // it and its host has a working Stripe payout account. This is enforced
    // here on the server, rather than trusting the dashboard badge alone.
    const { data: reservableProperty, error: reservablePropertyError } = await adminClient
      .from('properties')
      .select('id, host_id, is_published, approval_status')
      .eq('id', propertyId)
      .maybeSingle();
    if (reservablePropertyError || !reservableProperty || !reservableProperty.is_published || reservableProperty.approval_status !== 'approved') {
      return json({ error: 'This private space is not live for reservations yet. It must be approved by ROVAH first.' }, 422);
    }

    const { data: hostReadiness, error: hostReadinessError } = await adminClient
      .from('host_profiles')
      .select('payout_status')
      .eq('user_id', reservableProperty.host_id)
      .maybeSingle();
    if (hostReadinessError || hostReadiness?.payout_status !== 'active') {
      return json({ error: 'This private space is completing secure payout setup and cannot accept reservations yet.' }, 422);
    }

    const { data: bookingRows, error: bookingError } = await userClient.rpc('create_booking_with_dogs_and_subscription', {
      p_property_id: propertyId,
      p_start_at: startAt,
      p_end_at: endAt,
      p_dog_profile_ids: dogProfileIds,
      p_courtesy_visit_credit_id: courtesyVisitCreditId,
      p_resolution_discount_offer_id: resolutionDiscountOfferId,
      p_loyalty_pass_offer_id: loyaltyPassOfferId,
    });
    if (bookingError) return json({ error: bookingError.message }, 400);

    const booking = Array.isArray(bookingRows) ? bookingRows[0] : bookingRows;
    if (!booking?.id) return json({ error: 'Reservation could not be created' }, 500);

    if (booking.payment_status === 'paid' || Number(booking.total_amount) === 0) {
      return json({
        bookingId: booking.id,
        reservationConfirmed: true,
        confirmationType: booking.payment_provider === 'loyalty_pass' ? 'loyalty_pass' : 'courtesy_waiver',
      });
    }

    // A Courtesy Waiver creates a confirmed $0 reservation above. Only paid
    // reservations reach this point, so Stripe is never required or invoked
    // for a zero-dollar booking.
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) return json({ error: 'Payments are not configured yet' }, 503);

    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
    const { error: holdError } = await adminClient
      .from('bookings')
      .update({
        payment_status: 'processing',
        payment_provider: 'stripe',
        // The member confirms this charge flow by selecting Confirm
        // Reservation before we open Stripe Checkout. Keep an audit time for
        // the saved-card, off-session flow used for future visits.
        payment_consent_at: new Date().toISOString(),
        payment_hold_expires_at: new Date(expiresAt * 1000).toISOString(),
        payment_updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .eq('guest_id', user.id)
      .in('status', ['payment_pending', 'confirmed']);
    if (holdError) throw holdError;

    const { data: property, error: propertyError } = await adminClient
      .from('properties')
      .select('name')
      .eq('id', propertyId)
      .maybeSingle();
    if (propertyError || !property) {
      await adminClient.from('bookings').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', booking.id);
      return json({ error: 'Property unavailable for checkout' }, 422);
    }

    const amount = Math.round(Number(booking.total_amount) * 100);
    if (!Number.isSafeInteger(amount) || amount < 50) {
      await adminClient.from('bookings').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', booking.id);
      return json({ error: 'Reservation total is invalid' }, 422);
    }

    const stripe = new Stripe(stripeSecretKey);
    let customerId: string | null = null;
    if (needsScheduledCard) {
      const { data: guest, error: guestError } = await adminClient
        .from('guest_profiles')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (guestError) throw guestError;
      customerId = guest?.stripe_customer_id ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          metadata: { rovah_guest_id: user.id },
        });
        customerId = customer.id;
        const { error: customerError } = await adminClient
          .from('guest_profiles')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', user.id);
        if (customerError) throw customerError;
      }
    }

    const session = needsScheduledCard
      ? await stripe.checkout.sessions.create({
        mode: 'setup',
        customer: customerId!,
        metadata: { booking_id: booking.id, payment_flow: 'scheduled_card' },
        setup_intent_data: {
          usage: 'off_session',
          metadata: { booking_id: booking.id },
        },
        success_url: `${appUrl}/reservations?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/property/${propertyId}?payment=cancelled`,
        expires_at: expiresAt,
      })
      : await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: user.email ?? undefined,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: { name: loyaltyPassOfferId ? `ROVAH subscription at ${property.name}` : `ROVAH reservation at ${property.name}` },
            unit_amount: amount,
          },
        }],
        metadata: { booking_id: booking.id, payment_flow: 'authorization_hold' },
        payment_intent_data: {
          capture_method: 'manual',
          metadata: { booking_id: booking.id },
        },
        success_url: `${appUrl}/reservations?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/property/${propertyId}?payment=cancelled`,
        expires_at: expiresAt,
      });

    if (!session.url) throw new Error('Stripe did not return a checkout link');

    const { error: updateError } = await adminClient
      .from('bookings')
      .update({
        payment_hold_expires_at: new Date(expiresAt * 1000).toISOString(),
        stripe_checkout_session_id: session.id,
        payment_updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .eq('guest_id', user.id)
      // Stripe can finish the authorization before this response returns.
      // Do not erase that confirmation merely because the webhook won the race.
      .in('status', ['payment_pending', 'confirmed']);
    if (updateError) throw updateError;

    return json({ bookingId: booking.id, checkoutUrl: session.url, reservationConfirmed: false });
  } catch (error) {
    console.error('create-booking-checkout', error);
    return json({ error: 'Unable to start secure checkout' }, 500);
  }
});
