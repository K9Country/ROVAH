import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const addressHash = async (address: string) => {
  const bytes = new TextEncoder().encode(address.trim().toLowerCase().replace(/\s+/g, ' '));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to verify your saved home address' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to verify your saved home address' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: profile, error: profileError } = await adminClient
      .from('guest_profiles')
      .select('address_line1, address_line2, city, state, postal_code, profile_completed_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const address = [profile?.address_line1, profile?.address_line2, profile?.city, profile?.state, profile?.postal_code]
      .map((part) => typeof part === 'string' ? part.trim() : '')
      .filter(Boolean)
      .join(', ');
    if (!profile?.profile_completed_at || !address) {
      return json({ error: 'Save a complete home address before receiving nearby promotions.' }, 422);
    }

    const hash = await addressHash(address);
    const { data: existing, error: existingError } = await adminClient
      .from('promotion_location_points')
      .select('address_hash, verified_at')
      .eq('member_id', user.id)
      .eq('source', 'verified_saved_address')
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.address_hash === hash && existing.verified_at) return json({ verified: true, unchanged: true });

    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_GEOCODING_API_KEY is not configured');
    const query = new URLSearchParams({ address, key: apiKey });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query}`);
    if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);
    const payload = await response.json();
    const result = payload.status === 'OK' ? payload.results?.[0] : null;
    const latitude = result?.geometry?.location?.lat;
    const longitude = result?.geometry?.location?.lng;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: 'We could not verify that saved home address. Review the street, city, state, and ZIP code.' }, 422);
    }

    const now = new Date().toISOString();
    const { error: writeError } = await adminClient.from('promotion_location_points').upsert({
      member_id: user.id,
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      source: 'verified_saved_address',
      address_hash: hash,
      verified_at: now,
      updated_at: now,
    }, { onConflict: 'member_id' });
    if (writeError) throw writeError;

    return json({ verified: true, unchanged: false });
  } catch (error) {
    console.error('save-member-promotion-location', error);
    return json({ error: 'We could not privately verify your saved home address. Your profile remains saved.' }, 500);
  }
});
