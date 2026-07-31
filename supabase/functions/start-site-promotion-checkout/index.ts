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

// Keep Stripe Checkout returns on the canonical production domain.
const appUrl = 'https://rovah.dog';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to continue' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to continue' }, 401);

    const body = await req.json();
    const promotionId = typeof body.promotionId === 'string' ? body.promotionId : null;
    if (!promotionId) return json({ error: 'Choose a promotion to continue' }, 400);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: promotion, error: promotionError } = await adminClient
      .from('local_promotions')
      .select('id, host_id, property_id, status, moderation_status, amount_cents, eligible_member_count, message, stripe_checkout_session_id, properties!inner(name)')
      .eq('id', promotionId)
      .maybeSingle();
    if (promotionError || !promotion || promotion.host_id !== user.id) {
      return json({ error: 'This promotion is not available for your host account' }, 403);
    }
    if (promotion.moderation_status === 'rejected') return json({ error: 'This promotion needs a revised message before payment can start' }, 409);
    if (promotion.amount_cents !== 200) {
      return json({ error: 'Promotion pricing is not configured correctly' }, 409);
    }
    if (promotion.status === 'pending_payment' && promotion.stripe_checkout_session_id) {
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (!stripeSecretKey) return json({ error: 'Promotion payments are not configured yet.' }, 503);
      const existingCheckout = await new Stripe(stripeSecretKey).checkout.sessions.retrieve(promotion.stripe_checkout_session_id);
      if (existingCheckout.status === 'open' && existingCheckout.url) return json({ checkoutUrl: existingCheckout.url, resumed: true });
      if (existingCheckout.payment_status === 'paid') {
        return json({ error: 'Stripe has confirmed payment for this promotion. It will show as paid and sent as soon as delivery is recorded.' }, 409);
      }
      const { error: expiredError } = await adminClient.rpc('mark_site_promotion_payment_not_completed', {
        p_promotion_id: promotion.id,
        p_checkout_session_id: promotion.stripe_checkout_session_id,
        p_reason: 'Your $2 promotion checkout was not completed. No charge was made and no promotion was sent.',
      });
      if (expiredError) throw expiredError;
      return json({ error: 'That checkout was not completed. No charge was made and no promotion was sent. Create a new promotion when you are ready.' }, 409);
    }
    const { data: eligibleMembers, error: audienceError } = await adminClient.rpc('site_promotion_eligible_members', {
      p_property_id: promotion.property_id,
    });
    if (audienceError) throw audienceError;
    const eligibleMemberCount = Array.isArray(eligibleMembers) ? eligibleMembers.length : 0;

    const { error: audienceUpdateError } = await adminClient
      .from('local_promotions')
      .update({ eligible_member_count: eligibleMemberCount, updated_at: new Date().toISOString() })
      .eq('id', promotion.id)
      .eq('host_id', user.id);
    if (audienceUpdateError) throw audienceUpdateError;

    if (eligibleMemberCount < 1) {
      return json({ error: 'No registered dog owners with a verified saved location are currently within 50 miles of this site. No charge was made.' }, 422);
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return json({ error: 'Promotion payments are not configured yet. Your promotion remains a private draft and has not been activated or sent.' }, 503);
    }

    const stripe = new Stripe(stripeSecretKey);
    if (promotion.status === 'pending_payment' && promotion.stripe_checkout_session_id) {
      const existingCheckout = await stripe.checkout.sessions.retrieve(promotion.stripe_checkout_session_id);
      if (existingCheckout.status === 'open' && existingCheckout.url) return json({ checkoutUrl: existingCheckout.url, resumed: true });
      if (existingCheckout.payment_status === 'paid') {
        return json({ error: 'Stripe has confirmed payment for this promotion. Delivery will begin as soon as the payment update is processed.' }, 409);
      }
      const { error: resetError } = await adminClient
        .from('local_promotions')
        .update({ status: 'draft', stripe_checkout_session_id: null, updated_at: new Date().toISOString() })
        .eq('id', promotion.id)
        .eq('host_id', user.id)
        .eq('status', 'pending_payment');
      if (resetError) throw resetError;
    } else if (promotion.status !== 'draft') {
      return json({ error: 'This promotion is not ready for payment' }, 409);
    }

    const property = Array.isArray(promotion.properties) ? promotion.properties[0] : promotion.properties;
    const propertyName = property?.name ?? 'your private space';
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: { name: `ROVAH: Promote ${propertyName}` },
          unit_amount: 200,
        },
      }],
      metadata: { local_promotion_id: promotion.id, property_id: promotion.property_id, host_id: user.id },
      payment_intent_data: { metadata: { local_promotion_id: promotion.id } },
      success_url: `${appUrl}/local-promotions?payment=success`,
      cancel_url: `${appUrl}/local-promotions?payment=cancelled`,
    });
    if (!checkout.url) throw new Error('Stripe did not return a checkout link');

    const { error: updateError } = await adminClient
      .from('local_promotions')
      .update({ status: 'pending_payment', stripe_checkout_session_id: checkout.id, updated_at: new Date().toISOString() })
      .eq('id', promotion.id)
      .eq('host_id', user.id)
      .eq('status', 'draft');
    if (updateError) throw updateError;

    const { error: notificationError } = await adminClient
      .from('host_promotion_notifications')
      .upsert({
        host_id: user.id,
        promotion_id: promotion.id,
        kind: 'payment_processing',
        title: 'Promotion payment processing',
        body: 'Your $2 promotion is waiting for Stripe confirmation. It will be sent only after payment succeeds.',
      }, { onConflict: 'promotion_id,kind' });
    if (notificationError) throw notificationError;

    return json({ checkoutUrl: checkout.url });
  } catch (error) {
    console.error('start-site-promotion-checkout', error);
    return json({ error: 'Unable to start secure promotion checkout. Your promotion was not activated.' }, 500);
  }
});
