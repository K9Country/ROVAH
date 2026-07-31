import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const RADIUS_MILES = 50;
const EARTH_RADIUS_MILES = 3958.7613;

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

const milesBetween = (
  originLatitude: number,
  originLongitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
) => {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const latitudeA = toRadians(originLatitude);
  const latitudeB = toRadians(destinationLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to search nearby private spaces.' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user || Boolean((user as { is_anonymous?: boolean }).is_anonymous)) {
      return json({ error: 'Sign in to search nearby private spaces.' }, 401);
    }

    const body = await req.json();
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!/^\d{5}(?:-\d{4})?$/.test(query)) return json({ error: 'Enter a valid ZIP code.' }, 400);

    const apiKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!apiKey) throw new Error('GOOGLE_GEOCODING_API_KEY is not configured');
    const geocodingQuery = new URLSearchParams({ address: query, components: 'country:US', key: apiKey });
    const geocodingResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${geocodingQuery}`);
    if (!geocodingResponse.ok) throw new Error(`Geocoding request failed with ${geocodingResponse.status}`);
    const geocodingPayload = await geocodingResponse.json();
    const origin = geocodingPayload.status === 'OK' ? geocodingPayload.results?.[0]?.geometry?.location : null;
    const originLatitude = typeof origin?.lat === 'number' ? origin.lat : Number.NaN;
    const originLongitude = typeof origin?.lng === 'number' ? origin.lng : Number.NaN;
    if (!Number.isFinite(originLatitude) || !Number.isFinite(originLongitude)) {
      return json({ error: 'We could not find that ZIP code.' }, 422);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: publishedProperties, error: propertyError } = await admin
      .from('properties')
      .select('id')
      .eq('is_published', true);
    if (propertyError) throw propertyError;
    const propertyIds = (publishedProperties ?? []).map((property) => property.id);
    if (propertyIds.length === 0) return json({ propertyIds: [] });

    const { data: points, error: pointsError } = await admin
      .from('promotion_location_points')
      .select('property_id, latitude, longitude')
      .eq('source', 'geocoded_site_address')
      .in('property_id', propertyIds);
    if (pointsError) throw pointsError;

    const nearby = (points ?? [])
      .flatMap((point) => {
        if (!point.property_id) return [];
        const distance = milesBetween(
          originLatitude,
          originLongitude,
          Number(point.latitude),
          Number(point.longitude),
        );
        return Number.isFinite(distance) && distance <= RADIUS_MILES
          ? [{ propertyId: point.property_id, distance }]
          : [];
      })
      .sort((left, right) => left.distance - right.distance);

    return json({ propertyIds: nearby.map((result) => result.propertyId) });
  } catch (error) {
    console.error('search-properties-near-location', error);
    return json({ error: 'We could not search nearby private spaces. Try another ZIP code.' }, 500);
  }
});
