import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const toE164 = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    const { bookingId } = await req.json();
    if (typeof bookingId !== 'string') return json({ error: 'A booking is required' }, 400);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id, guest_id, property_id, start_at, end_at, status, payment_status, host_sms_notified_at, host_sms_notification_claimed_at')
      .eq('id', bookingId)
      .maybeSingle();
    if (bookingError || !booking || booking.guest_id !== user.id) return json({ error: 'Reservation not found' }, 404);
    if (booking.status !== 'confirmed' || booking.payment_status !== 'paid') {
      return json({ error: 'The reservation must be confirmed and paid before the host is notified' }, 409);
    }
    if (booking.host_sms_notified_at) return json({ sent: false, reason: 'already_sent' });

    const claimTime = new Date().toISOString();
    const { data: claimedBooking, error: claimError } = await adminClient
      .from('bookings')
      .update({ host_sms_notification_claimed_at: claimTime })
      .eq('id', booking.id)
      .is('host_sms_notified_at', null)
      .is('host_sms_notification_claimed_at', null)
      .select('id')
      .maybeSingle();
    if (claimError) return json({ error: 'Unable to prepare the host notification' }, 500);
    if (!claimedBooking) return json({ sent: false, reason: 'already_processing' });

    const { data: property, error: propertyError } = await adminClient
      .from('properties')
      .select('name, host_id')
      .eq('id', booking.property_id)
      .maybeSingle();
    if (propertyError || !property) {
      await adminClient.from('bookings').update({ host_sms_notification_claimed_at: null }).eq('id', booking.id);
      return json({ error: 'Property not found' }, 404);
    }

    const [{ data: guest }, { data: host }, { data: smsPreference }] = await Promise.all([
      adminClient.from('guest_profiles').select('full_name').eq('user_id', booking.guest_id).maybeSingle(),
      adminClient.from('host_profiles').select('phone').eq('user_id', property.host_id).maybeSingle(),
      adminClient
        .from('sms_notification_preferences')
        .select('sms_updates, consented_phone, opted_out_at')
        .eq('user_id', property.host_id)
        .maybeSingle(),
    ]);
    const recipient = host?.phone ? toE164(host.phone) : null;
    if (!recipient) {
      await adminClient.from('bookings').update({ host_sms_notification_claimed_at: null }).eq('id', booking.id);
      return json({ error: 'The host has no valid mobile number configured' }, 422);
    }

    const consentedRecipient = smsPreference?.consented_phone
      ? toE164(smsPreference.consented_phone)
      : null;
    if (!smsPreference?.sms_updates || smsPreference.opted_out_at || consentedRecipient !== recipient) {
      await adminClient.from('bookings').update({ host_sms_notification_claimed_at: null }).eq('id', booking.id);
      return json({ sent: false, reason: 'host_sms_not_opted_in' });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_FROM_NUMBER');
    if (!accountSid || !authToken || !from) {
      await adminClient.from('bookings').update({ host_sms_notification_claimed_at: null }).eq('id', booking.id);
      return json({ error: 'SMS service is not configured' }, 503);
    }

    const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'America/New_York' }).format(new Date(booking.start_at));
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    const guestName = guest?.full_name?.trim() || 'A ROVAH member';
    const message = `ROVAH: Upcoming reservation at ${property.name}. ${guestName} is booked for ${date}, ${time.format(new Date(booking.start_at))}–${time.format(new Date(booking.end_at))} ET.`;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: recipient, From: from, Body: message }),
    });
    if (!response.ok) {
      await adminClient.from('bookings').update({ host_sms_notification_claimed_at: null }).eq('id', booking.id);
      return json({ error: 'SMS provider rejected the notification' }, 502);
    }

    const { error: markSentError } = await adminClient
      .from('bookings')
      .update({ host_sms_notified_at: new Date().toISOString(), host_sms_notification_claimed_at: null })
      .eq('id', booking.id);
    if (markSentError) return json({ error: 'The reservation notification was sent but could not be recorded' }, 500);

    return json({ sent: true });
  } catch {
    return json({ error: 'Unable to send host notification' }, 500);
  }
});
