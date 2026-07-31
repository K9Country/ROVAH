import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character] ?? character));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { propertyId } = await req.json();
    if (typeof propertyId !== 'string') return json({ error: 'A site is required' }, 400);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: property, error: propertyError } = await adminClient
      .from('properties')
      .select('id, name, city, state, host_id, approval_status')
      .eq('id', propertyId)
      .eq('host_id', user.id)
      .maybeSingle();
    if (propertyError || !property) return json({ error: 'Site not found' }, 404);
    if (property.approval_status !== 'pending') return json({ error: 'Only submitted sites can be reviewed' }, 409);

    const { data: host } = await adminClient
      .from('host_profiles')
      .select('full_name, email')
      .eq('user_id', user.id)
      .maybeSingle();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ sent: false, reason: 'mail_not_configured' }, 503);

    const administratorEmail = Deno.env.get('ADMIN_NOTIFICATION_TO_EMAIL') ?? 'steve.myers@rovah.dog';
    const fromEmail = Deno.env.get('ADMIN_NOTIFICATION_FROM_EMAIL') ?? 'support@rovah.dog';
    const appUrl = (Deno.env.get('APP_URL') ?? 'https://rovah.dog').replace(/\/$/, '');
    const siteName = escapeHtml(property.name || 'Untitled private space');
    const hostName = escapeHtml(host?.full_name?.trim() || 'A host');
    const hostEmail = escapeHtml(host?.email?.trim() || user.email || 'No email available');
    const location = escapeHtml([property.city, property.state].filter(Boolean).join(', ') || 'Location not provided');
    const reviewUrl = `${appUrl}/admin`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `ROVAH Site Review <${fromEmail}>`,
        to: [administratorEmail],
        subject: `Site review requested: ${property.name || 'Untitled private space'}`,
        html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5;max-width:620px"><h1 style="font-size:22px">A host submitted a site for review</h1><p><strong>${hostName}</strong> (${hostEmail}) submitted <strong>${siteName}</strong> in ${location}.</p><p>Review the host record, site details, photos, rules, and amenities. You can approve the listing or request required changes for the host to resubmit.</p><p style="margin:28px 0"><a href="${reviewUrl}" style="background:#234b2d;color:#fff;padding:13px 19px;border-radius:8px;text-decoration:none;font-weight:bold">Review submitted site</a></p><p style="font-size:12px;color:#666">For security, sign in with your authorized administrator account before reviewing the site.</p></div>`,
      }),
    });
    if (!response.ok) {
      console.error('Resend rejected administrator notification', await response.text());
      return json({ error: 'Email provider rejected the administrator notification' }, 502);
    }

    return json({ sent: true });
  } catch (error) {
    console.error('Unable to notify administrator of site submission', error);
    return json({ error: 'Unable to send administrator notification' }, 500);
  }
});
