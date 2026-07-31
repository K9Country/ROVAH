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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to open the payout dashboard.' }, 401);

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return json({ error: 'Stripe payout setup is not configured yet.' }, 503);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user || user.is_anonymous) return json({ error: 'Sign in to open the payout dashboard.' }, 401);

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
    if (!host?.stripe_connected_account_id) return json({ error: 'Finish Stripe payout setup first.' }, 409);
    if (host.payout_status !== 'active') return json({ error: 'Finish Stripe payout setup before opening the payout dashboard.' }, 409);

    const response = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(host.stripe_connected_account_id)}/login_links`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload?.url !== 'string') {
      throw new Error(typeof payload?.error?.message === 'string' ? payload.error.message : 'Stripe could not open the payout dashboard.');
    }

    return json({ dashboardUrl: payload.url });
  } catch (error) {
    console.error('create-host-express-dashboard-link', error);
    return json({ error: error instanceof Error ? error.message : 'Unable to open the payout dashboard.' }, 500);
  }
});
