import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

const appUrl = 'https://rovah.dog';
const stripeVersion = '2026-06-24.dahlia';

type StripeCoreAccount = {
  id?: string;
};

class StripeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'StripeRequestError';
  }
}

async function stripeV2Request<T>(
  secretKey: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Stripe-Version': stripeVersion,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : 'Stripe could not start payout setup.';
    const code = typeof payload?.error?.code === 'string' ? payload.error.code : undefined;
    throw new StripeRequestError(message, response.status, code);
  }
  return payload as T;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to set up payouts.' }, 401);

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    return json({ error: 'Stripe payout setup is not configured yet. Please try again after ROVAH finishes payment setup.' }, 503);
  }

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user || user.is_anonymous) return json({ error: 'Sign in to set up payouts.' }, 401);
    if (!user.email) return json({ error: 'Add an email address to your host account before setting up payouts.' }, 422);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    const { data: host, error: hostError } = await admin
      .from('host_profiles')
      .select('user_id, full_name, first_name, last_name, stripe_connected_account_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (hostError) throw hostError;
    if (!host) return json({ error: 'Only a host account can set up host payouts.' }, 403);

    let accountId = host.stripe_connected_account_id as string | null;
    if (!accountId) {
      const firstName = typeof host.first_name === 'string' ? host.first_name.trim() : '';
      const lastName = typeof host.last_name === 'string' ? host.last_name.trim() : '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ') || host.full_name?.trim() || 'ROVAH Host';
      const account = await stripeV2Request<StripeCoreAccount>(
        stripeSecretKey,
        '/v2/core/accounts',
        'POST',
        {
          contact_email: user.email,
          display_name: displayName,
          defaults: {
            responsibilities: {
              fees_collector: 'application',
              losses_collector: 'application',
            },
          },
          dashboard: 'express',
          identity: { country: 'us' },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
          include: ['configuration.recipient', 'identity', 'requirements'],
        },
        `rovah-host-connect-account-${user.id}`,
      );
      if (!account.id) throw new Error('Stripe did not return a connected account.');
      accountId = account.id;

      const { error: profileError } = await admin
        .from('host_profiles')
        .update({ stripe_connected_account_id: accountId, payout_status: 'pending' })
        .eq('user_id', user.id)
        .is('stripe_connected_account_id', null);
      if (profileError) throw profileError;
    }

    const accountLink = await stripeV2Request<{ url?: string }>(
      stripeSecretKey,
      '/v2/core/account_links',
      'POST',
      {
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['recipient'],
            return_url: `${appUrl}/host-payments?stripe=return`,
            refresh_url: `${appUrl}/host-payments?stripe=refresh`,
          },
        },
      },
    );
    if (!accountLink.url) throw new Error('Stripe did not return a payout setup link.');

    return json({ onboardingUrl: accountLink.url });
  } catch (error) {
    const isStripeError = error instanceof StripeRequestError;
    console.error('start-host-payout-onboarding', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stripeStatus: isStripeError ? error.status : undefined,
      stripeCode: isStripeError ? error.code : undefined,
    });
    if (isStripeError) {
      // The app intentionally shows this response to the host. It contains
      // Stripe's safe, actionable setup message but never an API key, payload,
      // or account secret.
      return json({
        error: `Stripe could not start payout setup: ${error.message}`,
        code: error.code ?? null,
      }, error.status >= 400 && error.status < 500 ? 422 : 502);
    }
    return json({ error: error instanceof Error ? error.message : 'Unable to start secure payout setup.' }, 500);
  }
});
