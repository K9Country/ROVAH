import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to verify this site location' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to verify this site location' }, 401);

    const body = await req.json();
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    if (!propertyId) return json({ error: 'Choose a private space first' }, 400);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: property, error: propertyError } = await adminClient
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .eq('host_id', user.id)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return json({ error: 'You can only verify a private space you manage' }, 403);

    const { data: location, error: locationError } = await adminClient
      .from('promotion_location_points')
      .select('verified_at')
      .eq('property_id', propertyId)
      .eq('source', 'geocoded_site_address')
      .maybeSingle();
    if (locationError) throw locationError;
    return json({ verified: Boolean(location?.verified_at), verifiedAt: location?.verified_at ?? null });
  } catch (error) {
    console.error('verify-site-promotion-location', error);
    return json({ error: 'We could not check this saved site address.' }, 500);
  }
});
