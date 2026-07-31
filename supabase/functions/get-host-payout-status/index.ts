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

const stripeVersion = '2026-06-24.dahlia';

type StripeCoreAccount = {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
};

async function getAccount(secretKey: string, accountId: string) {
  const response = await fetch(
    `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.recipient`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': stripeVersion,
      },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : 'Stripe could not verify the payout account.';
    throw new Error(message);
  }
  return payload as StripeCoreAccount;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to view payout status.' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user || user.is_anonymous) return json({ error: 'Sign in to view payout status.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    const { data: host, error: hostError } = await admin
      .from('host_profiles')
      .select('stripe_connected_account_id, payout_status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (hostError) throw hostError;
    if (!host) return json({ error: 'Only a host account can view payout status.' }, 403);

    if (!host.stripe_connected_account_id) {
      return json({ status: 'not_connected', connected: false, setupAvailable: Boolean(Deno.env.get('STRIPE_SECRET_KEY')) });
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return json({ status: host.payout_status ?? 'pending', connected: true, setupAvailable: false });
    }

    const account = await getAccount(stripeSecretKey, host.stripe_connected_account_id);
    const transferStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    const status = transferStatus === 'active' ? 'active' : transferStatus === 'inactive' ? 'restricted' : 'pending';
    if (status !== host.payout_status) {
      const { error: updateError } = await admin
        .from('host_profiles')
        .update({ payout_status: status })
        .eq('user_id', user.id);
      if (updateError) throw updateError;
    }

    return json({ status, connected: true, setupAvailable: true });
  } catch (error) {
    console.error('get-host-payout-status', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to check payout status.' }, 500);
  }
});
