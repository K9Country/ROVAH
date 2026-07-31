import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const TERMS_VERSION = '2026-07-27';
const WAIVER_VERSION = '2026-07-27';

function requestIp(req: Request) {
  const candidate = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  // Persist only a conventional IP address. Some platforms provide an opaque
  // proxy value, which is not treated as an IP address for the acceptance log.
  return candidate && /^[0-9a-fA-F:.]{3,64}$/.test(candidate) ? candidate : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in to accept the current legal agreements.' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return json({ error: 'Sign in to accept the current legal agreements.' }, 401);

    const body = await req.json();
    const accepted = body?.termsAccepted === true
      && body?.waiverAcknowledged === true
      && body?.adultCertified === true
      && body?.releaseAcknowledged === true;
    if (!accepted) return json({ error: 'All required acknowledgements must be selected.' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const acceptedAtClient = typeof body?.clientAcceptedAt === 'string' ? body.clientAcceptedAt : null;
    const clientPlatform = typeof body?.clientPlatform === 'string' ? body.clientPlatform.slice(0, 80) : null;
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 1000) || null;
    const context = {
      source: 'updated_agreement_gate',
      client_accepted_at: acceptedAtClient,
      client_platform: clientPlatform,
      adult_certified: true,
      release_acknowledged: true,
    };

    const { error } = await admin.from('user_legal_acceptances').upsert([
      {
        user_id: user.id,
        document_key: 'terms_of_service',
        document_title: 'ROVAH Terms of Service',
        document_version: TERMS_VERSION,
        ip_address: requestIp(req),
        user_agent: userAgent,
        acceptance_context: context,
      },
      {
        user_id: user.id,
        document_key: 'liability_waiver_release',
        document_title: 'ROVAH Guest Liability Waiver and Release',
        document_version: WAIVER_VERSION,
        ip_address: requestIp(req),
        user_agent: userAgent,
        acceptance_context: context,
      },
    ], { onConflict: 'user_id,document_key,document_version', ignoreDuplicates: true });
    if (error) throw error;

    return json({ accepted: true, termsVersion: TERMS_VERSION, waiverVersion: WAIVER_VERSION });
  } catch (error) {
    console.error('accept-legal-agreements', error instanceof Error ? error.message : error);
    return json({ error: 'We could not record your agreement acceptance. Please try again.' }, 500);
  }
});
