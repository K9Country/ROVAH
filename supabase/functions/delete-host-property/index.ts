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

const messageForDeleteError = (message: string) =>
  message.includes("This site can't be deleted because it has reservations.")
    ? "This site can't be deleted because it has reservations."
    : 'We could not delete this site. Please try again.';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to manage this site.' }, 401);

  try {
    const body = await request.json();
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : null;
    if (!propertyId) return json({ error: 'Choose a site to delete.' }, 400);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user || user.is_anonymous) return json({ error: 'Sign in to manage this site.' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Ownership is checked before collecting any files or issuing a delete.
    const { data: property, error: propertyError } = await adminClient
      .from('properties')
      .select('id, host_id, name')
      .eq('id', propertyId)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property || property.host_id !== user.id) {
      return json({ error: 'You can only delete sites from your own host account.' }, 403);
    }

    const { count: reservationCount, error: reservationError } = await adminClient
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId);
    if (reservationError) throw reservationError;
    if ((reservationCount ?? 0) > 0) {
      return json({ error: "This site can't be deleted because it has reservations." }, 409);
    }

    // Capture only files attached to this exact site. Database cascades clean
    // site-only rows; storage cleanup happens only after the delete succeeds.
    const [{ data: propertyImages, error: imageError }, { data: promotions, error: promotionError }] = await Promise.all([
      adminClient.from('property_images').select('storage_path').eq('property_id', propertyId),
      adminClient.from('local_promotions').select('image_path').eq('property_id', propertyId),
    ]);
    if (imageError) throw imageError;
    if (promotionError) throw promotionError;

    const { data: deletedProperty, error: deleteError } = await adminClient
      .from('properties')
      .delete()
      .eq('id', propertyId)
      .eq('host_id', user.id)
      .select('id')
      .maybeSingle();
    if (deleteError) return json({ error: messageForDeleteError(deleteError.message) }, deleteError.message.includes('reservations') ? 409 : 500);
    if (!deletedProperty) return json({ error: 'This site is no longer available to delete.' }, 409);

    const propertyImagePaths = (propertyImages ?? []).map((image) => image.storage_path).filter(Boolean);
    const promotionImagePaths = (promotions ?? []).map((promotion) => promotion.image_path).filter((path): path is string => Boolean(path));
    const cleanupResults = await Promise.all([
      propertyImagePaths.length ? adminClient.storage.from('property-images').remove(propertyImagePaths) : Promise.resolve({ error: null }),
      promotionImagePaths.length ? adminClient.storage.from('promotion-images').remove(promotionImagePaths) : Promise.resolve({ error: null }),
    ]);
    cleanupResults.forEach((result) => {
      if (result.error) console.error('Site asset cleanup failed after a successful site deletion:', result.error.message);
    });

    return json({ deleted: true, siteName: property.name });
  } catch (error) {
    console.error('delete-host-property', error);
    return json({ error: error instanceof Error ? messageForDeleteError(error.message) : 'We could not delete this site. Please try again.' }, 500);
  }
});
