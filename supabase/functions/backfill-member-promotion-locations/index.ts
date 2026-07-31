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

type MemberProfile = {
  user_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Host sign-in required' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Host sign-in required' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: hostedProperty, error: hostedPropertyError } = await adminClient
      .from('properties')
      .select('id')
      .eq('host_id', user.id)
      .eq('is_published', true)
      .limit(1)
      .maybeSingle();
    if (hostedPropertyError) throw hostedPropertyError;
    if (!hostedProperty) return json({ error: 'A published host site is required' }, 403);

    // This runs automatically when a host opens Promotion Center. A bounded
    // batch keeps the endpoint predictable; matching home addresses are never
    // returned to the host or client.
    const { data: profiles, error: profilesError } = await adminClient
      .from('guest_profiles')
      .select('user_id, address_line1, address_line2, city, state, postal_code')
      .not('profile_completed_at', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(25);
    if (profilesError) throw profilesError;

    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_GEOCODING_API_KEY is not configured');

    let verified = 0;
    let unchanged = 0;
    let failed = 0;
    for (const profile of (profiles ?? []) as MemberProfile[]) {
      const address = [profile.address_line1, profile.address_line2, profile.city, profile.state, profile.postal_code]
        .map((part) => typeof part === 'string' ? part.trim() : '')
        .filter(Boolean)
        .join(', ');
      if (!address) {
        failed += 1;
        continue;
      }

      try {
        const hash = await addressHash(address);
        const { data: existing, error: existingError } = await adminClient
          .from('promotion_location_points')
          .select('address_hash, verified_at')
          .eq('member_id', profile.user_id)
          .eq('source', 'verified_saved_address')
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing?.address_hash === hash && existing.verified_at) {
          unchanged += 1;
          continue;
        }

        const query = new URLSearchParams({ address, key: apiKey });
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query}`);
        if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);
        const payload = await response.json();
        const result = payload.status === 'OK' ? payload.results?.[0] : null;
        const latitude = result?.geometry?.location?.lat;
        const longitude = result?.geometry?.location?.lng;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Saved address could not be geocoded');

        const now = new Date().toISOString();
        const { error: writeError } = await adminClient.from('promotion_location_points').upsert({
          member_id: profile.user_id,
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          source: 'verified_saved_address',
          address_hash: hash,
          verified_at: now,
          updated_at: now,
        }, { onConflict: 'member_id' });
        if (writeError) throw writeError;
        verified += 1;
      } catch (error) {
        // Do not log or return home-address details.
        console.error('member promotion location backfill failed', profile.user_id, error instanceof Error ? error.message : error);
        failed += 1;
      }
    }

    return json({ processed: profiles?.length ?? 0, verified, unchanged, failed });
  } catch (error) {
    console.error('backfill-member-promotion-locations', error);
    return json({ error: 'The private home-address backfill could not be completed. Please try again.' }, 500);
  }
});
