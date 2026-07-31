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
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to use the saved site address' }, 401);

  try {
    const body = await req.json();
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    if (!propertyId) return json({ error: 'Choose a private space first' }, 400);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to use the saved site address' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: property, error: propertyError } = await adminClient
      .from('properties')
      .select('id, site_address, city, state, postal_code')
      .eq('id', propertyId)
      .eq('host_id', user.id)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return json({ error: 'You can only use a private space you manage' }, 403);

    const address = [property.site_address, property.city, property.state, property.postal_code]
      .map((part) => typeof part === 'string' ? part.trim() : '')
      .filter(Boolean)
      .join(', ');
    if (!address) return json({ error: 'Add a complete site address before creating a promotion' }, 422);

    const hash = await addressHash(address);
    const { data: existing, error: existingError } = await adminClient
      .from('promotion_location_points')
      .select('address_hash, verified_at')
      .eq('property_id', propertyId)
      .eq('source', 'geocoded_site_address')
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
      return json({ error: 'We could not verify that saved site address. Review the street, city, state, and ZIP code.' }, 422);
    }

    const now = new Date().toISOString();
    const { error: writeError } = await adminClient.from('promotion_location_points').upsert({
      property_id: propertyId,
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      source: 'geocoded_site_address',
      address_hash: hash,
      verified_at: now,
      updated_at: now,
    }, { onConflict: 'property_id' });
    if (writeError) throw writeError;

    return json({ verified: true, unchanged: false });
  } catch (error) {
    console.error('sync-site-promotion-location', error);
    return json({ error: 'We could not verify the saved site address. Please review the property address and try again.' }, 500);
  }
});
