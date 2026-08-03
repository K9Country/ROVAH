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

  // The database reservation is created before Stripe Checkout can return its
  // URL. Keep its id so a Stripe or network failure cannot leave a false hold
  // on the calendar.
  let createdBookingId: string | null = null;
  let paymentAttemptUserId: string | null = null;
  let checkoutStage = 'authenticate_member';

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to reserve this space' }, 401);
    paymentAttemptUserId = user.id;

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

    // Every standard-rate visit uses Stripe's secure card-saving flow. This
    // avoids time-limited card authorizations and lets ROVAH make the agreed
    // off-session charge exactly one hour before the visit.
    const visitStart = new Date(startAt);
    if (Number.isNaN(visitStart.getTime())) return json({ error: 'Choose a valid visit time' }, 400);
    // A subscription is a prepaid package: its credits can be used whenever
    // the member visits, so the entire package must be captured at checkout.
    const isSubscriptionPurchase = Boolean(loyaltyPassOfferId);
    const needsScheduledCard = !isSubscriptionPurchase;

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

    checkoutStage = 'create_reservation';
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
    createdBookingId = booking.id;

    if (booking.payment_status === 'paid' || Number(booking.total_amount) === 0) {
      createdBookingId = null;
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
    checkoutStage = 'prepare_reservation_payment';
    const { error: holdError } = await adminClient
      .from('bookings')
      .update({
        // Until Stripe confirms a card setup or a subscription payment, this
        // is only a short checkout hold. It is not a confirmed reservation and
        // is intentionally hidden from the host and guest reservation lists.
        status: 'payment_pending',
        payment_status: 'processing',
        payment_provider: isSubscriptionPurchase ? 'loyalty_pass_purchase' : 'stripe',
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
      checkoutStage = 'load_saved_card_customer';
      const { data: guest, error: guestError } = await adminClient
        .from('guest_profiles')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (guestError) throw guestError;
      customerId = guest?.stripe_customer_id ?? null;
      if (!customerId) {
        checkoutStage = 'create_saved_card_customer';
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

    checkoutStage = needsScheduledCard ? 'create_saved_card_checkout' : 'create_immediate_checkout';
    const session = needsScheduledCard
      ? await stripe.checkout.sessions.create({
        mode: 'setup',
        customer: customerId!,
        // Future regular reservations use this card for the automatic charge
        // one hour before the visit. Restrict the setup session to cards so
        // Checkout never selects a payment method that cannot be charged
        // off-session later.
        payment_method_types: ['card'],
        metadata: { booking_id: booking.id, payment_flow: 'scheduled_card' },
        setup_intent_data: { metadata: { booking_id: booking.id } },
        success_url: `${appUrl}/reservations?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/property/${propertyId}?payment=cancelled`,
        expires_at: expiresAt,
      }, { idempotencyKey: `rovah-booking-checkout-${booking.id}` })
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
        metadata: {
          booking_id: booking.id,
          payment_flow: isSubscriptionPurchase ? 'subscription_purchase' : 'authorization_hold',
        },
        payment_intent_data: {
          metadata: { booking_id: booking.id },
          // Omit manual capture for prepaid subscriptions so Stripe captures
          // the full package price immediately after successful checkout.
          ...(isSubscriptionPurchase ? {} : { capture_method: 'manual' as const }),
        },
        success_url: `${appUrl}/reservations?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/property/${propertyId}?payment=cancelled`,
        expires_at: expiresAt,
      }, { idempotencyKey: `rovah-booking-checkout-${booking.id}` });

    if (!session.url) throw new Error('Stripe did not return a checkout link');

    checkoutStage = 'save_checkout_session';
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

    // Checkout is now live and owns the temporary hold. Do not cancel it from
    // the catch block if anything happens while writing the response.
    createdBookingId = null;
    return json({ bookingId: booking.id, checkoutUrl: session.url, reservationConfirmed: false });
  } catch (error) {
    console.error('create-booking-checkout', error);
    if (createdBookingId) {
      const cleanupClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await cleanupClient.from('payment_attempt_failures').insert({
        booking_id: createdBookingId,
        guest_id: paymentAttemptUserId,
        stage: checkoutStage,
        error_message: error instanceof Error ? error.message : String(error),
      });
      const { error: cleanupError } = await cleanupClient
        .from('bookings')
        .update({
          status: 'cancelled',
          payment_status: 'failed',
          payment_released_at: new Date().toISOString(),
          payment_updated_at: new Date().toISOString(),
        })
        .eq('id', createdBookingId)
        .eq('status', 'payment_pending');
      if (cleanupError) console.error('create-booking-checkout cleanup', cleanupError);
    }
    return json({
      error: 'Unable to start secure checkout. No reservation was made and no payment was collected. Please try again.',
    }, 500);
  }
});
