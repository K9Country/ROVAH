import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const addressComponent = (components: Array<{ long_name?: string; types?: string[] }>, type: string) =>
  components.find((component) => component.types?.includes(type))?.long_name ?? null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to use your current location.' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user || Boolean((user as { is_anonymous?: boolean }).is_anonymous)) {
      return json({ error: 'Sign in to use your current location.' }, 401);
    }

    const body = await req.json();
    const latitude = typeof body.latitude === 'number' ? body.latitude : Number.NaN;
    const longitude = typeof body.longitude === 'number' ? body.longitude : Number.NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return json({ error: 'Choose a valid location.' }, 400);
    }

    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_GEOCODING_API_KEY is not configured');
    const query = new URLSearchParams({ latlng: `${latitude},${longitude}`, key: apiKey });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query}`);
    if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);
    const payload = await response.json();
    const components = payload.status === 'OK' ? payload.results?.[0]?.address_components : null;
    if (!Array.isArray(components)) return json({ error: 'We could not determine a nearby city or ZIP code.' }, 422);

    const searchTerm = addressComponent(components, 'postal_code')
      ?? addressComponent(components, 'locality')
      ?? addressComponent(components, 'postal_town');
    if (!searchTerm) return json({ error: 'We could not determine a nearby city or ZIP code.' }, 422);

    return json({ searchTerm });
  } catch (error) {
    console.error('resolve-search-location', error);
    return json({ error: 'We could not use your current location. Try a city or ZIP code instead.' }, 500);
  }
});
