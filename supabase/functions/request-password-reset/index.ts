import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set(['https://rovah.dog', 'https://k9-country.expo.app']);

const responseHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://rovah.dog',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  Vary: 'Origin',
});

const reply = (origin: string | null, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] ?? character));

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(origin) });
  if (request.method !== 'POST') return reply(origin, { error: 'Method not allowed.' }, 405);
  if (origin && !allowedOrigins.has(origin)) return reply(origin, { error: 'Not allowed.' }, 403);

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const intent = body.intent === 'admin' ? 'admin' : 'guest';
  // Keep the external response identical for unknown addresses to avoid account discovery.
  const success = () => reply(origin, { ok: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return success();

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) return reply(origin, { error: 'Password reset email is temporarily unavailable.' }, 503);

  const service = createClient(supabaseUrl, serviceRoleKey);
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const [emailKey, ipKey] = await Promise.all([
    sha256(`email:${email}`),
    sha256(`ip:${forwardedFor}`),
  ]);
  const now = Date.now();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

  await service.from('password_reset_delivery_limits').delete().lt('requested_at', new Date(now - 24 * 60 * 60 * 1000).toISOString());
  const { data: recentLimits } = await service
    .from('password_reset_delivery_limits')
    .select('request_key, requested_at')
    .in('request_key', [emailKey, ipKey]);
  const emailRecent = recentLimits?.some((limit) => limit.request_key === emailKey && limit.requested_at >= tenMinutesAgo);
  const ipRecent = recentLimits?.some((limit) => limit.request_key === ipKey && limit.requested_at >= fiveMinutesAgo);
  if (emailRecent || ipRecent) return success();

  await service.from('password_reset_delivery_limits').upsert([
    { request_key: emailKey, requested_at: new Date().toISOString() },
    { request_key: ipKey, requested_at: new Date().toISOString() },
  ]);

  const appUrl = (Deno.env.get('APP_URL') ?? 'https://rovah.dog').replace(/\/$/, '');
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/reset-password?intent=${intent}` },
  });
  if (linkError || !link.properties.action_link) return success();

  const displayName = escapeHtml(link.user.user_metadata?.full_name || 'ROVAH member');
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `ROVAH <${Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'support@rovah.dog'}>`,
      to: [email],
      subject: 'Reset your ROVAH password',
      html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5"><h1>Reset your password</h1><p>Hello ${displayName},</p><p>Use this secure link to choose a new ROVAH password.</p><p style="margin:24px 0"><a href="${link.properties.action_link}" style="display:inline-block;background:#233d28;border-radius:8px;color:#fffdf8;font-weight:700;padding:12px 18px;text-decoration:none">Choose a new password</a></p><p>This link is one-time use. If you did not request it, you can ignore this email.</p></div>`,
    }),
  });
  if (!emailResponse.ok) return reply(origin, { error: 'Password reset email is temporarily unavailable.' }, 503);

  return success();
});
