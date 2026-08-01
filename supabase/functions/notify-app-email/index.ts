import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationType = 'reservation_created' | 'message_created' | 'host_profile_created';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] ?? character));

const friendlyDate = (value: string | null, timeZone?: string | null) => value
  ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone ?? undefined }).format(new Date(value))
  : 'the scheduled time';

const currency = (value: number | string | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

const actionLink = (url: string, label: string) =>
  `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#233d28;border-radius:8px;color:#fffdf8;font-weight:700;padding:12px 18px;text-decoration:none">${label}</a></p>`;

const facebookLink =
  '<p style="margin:24px 0 0"><a href="https://www.facebook.com/ROVAH.dog/" style="color:#233d28;font-weight:700">Follow ROVAH on Facebook</a></p>';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const service = createClient(supabaseUrl, serviceRoleKey);
    const token = authorization.slice(7);
    // Stripe's signed webhook can make this internal call after a successful
    // payment. The service-role key remains server-only and is never accepted
    // from the app browser.
    const isTrustedServiceCall = token === serviceRoleKey;
    const { data: { user }, error: userError } = isTrustedServiceCall
      ? { data: { user: null }, error: null }
      : await service.auth.getUser(token);
    if (!isTrustedServiceCall && (userError || !user)) return json({ error: 'Unauthorized' }, 401);

    const { type, resourceId } = await req.json() as { type?: NotificationType; resourceId?: string };
    if (!type || !resourceId) return json({ error: 'A notification type and record are required' }, 400);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) return json({ ok: true, sent: false, reason: 'mail_not_configured' });

    const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'support@rovah.dog';
    const administratorEmail = Deno.env.get('ADMIN_NOTIFICATION_TO_EMAIL') ?? 'steve.myers@rovah.dog';
    const appUrl = (Deno.env.get('APP_URL') ?? 'https://rovah.dog').replace(/\/$/, '');
    const recipients: Array<{ email: string; subject: string; html: string }> = [];

    if (type === 'reservation_created') {
      const { data: booking, error } = await service
        .from('bookings')
        .select('id, property_id, guest_id, start_at, end_at, dog_count, total_amount, status, payment_status, payment_provider, loyalty_pass_credit_hours_applied, properties(id, name, city, state, time_zone, host_id), booking_dogs(name), loyalty_pass_offers(name, credit_count, duration_months)')
        .eq('id', resourceId)
        .maybeSingle();
      if (error || !booking) return json({ error: 'Reservation not found' }, 404);
      const property = Array.isArray(booking.properties) ? booking.properties[0] : booking.properties;
      if (!property || (!isTrustedServiceCall && user?.id !== booking.guest_id && user?.id !== property.host_id)) return json({ error: 'Unauthorized' }, 403);

      const { data: guestResult } = await service.auth.admin.getUserById(booking.guest_id);
      const { data: hostResult } = await service.auth.admin.getUserById(property.host_id);
      const siteName = escapeHtml(property.name || 'your private space');
      const offer = Array.isArray(booking.loyalty_pass_offers) ? booking.loyalty_pass_offers[0] : booking.loyalty_pass_offers;
      const isSubscriptionPurchase = booking.payment_provider === 'loyalty_pass_purchase';
      const { data: subscriptionPass } = isSubscriptionPurchase
        ? await service
          .from('member_loyalty_passes')
          .select('credit_hours_total, credit_hours_remaining, expires_at, status')
          .eq('purchase_booking_id', booking.id)
          .maybeSingle()
        : { data: null };
      const dogs = (booking.booking_dogs ?? []).map((dog) => escapeHtml(dog.name)).join(', ') || `${booking.dog_count} dog${booking.dog_count === 1 ? '' : 's'}`;
      const siteTimeZone = property.time_zone || null;
      const visitDetails = `<p><strong>Private space:</strong> ${siteName}<br /><strong>Location:</strong> ${escapeHtml([property.city, property.state].filter(Boolean).join(', ') || 'Shown in ROVAH')}<br /><strong>Visit:</strong> ${escapeHtml(friendlyDate(booking.start_at, siteTimeZone))} to ${escapeHtml(friendlyDate(booking.end_at, siteTimeZone))}<br /><strong>Dogs:</strong> ${dogs}<br /><strong>Reservation total:</strong> ${currency(booking.total_amount)}</p>`;
      const subscriptionDetails = isSubscriptionPurchase
        ? `<p><strong>Subscription:</strong> ${escapeHtml(offer?.name || 'ROVAH subscription')}<br /><strong>Included visit credits:</strong> ${subscriptionPass?.credit_hours_total ?? offer?.credit_count ?? '—'}<br /><strong>Credits remaining after this visit:</strong> ${subscriptionPass?.credit_hours_remaining ?? '—'}<br /><strong>Valid through:</strong> ${escapeHtml(friendlyDate(subscriptionPass?.expires_at ?? null, siteTimeZone))}<br /><strong>Purchase status:</strong> ${subscriptionPass?.status === 'active' ? 'Paid and active' : 'Payment confirmed'}</p>`
        : `<p><strong>Payment:</strong> ${booking.payment_status === 'paid' ? 'Paid' : 'Scheduled for collection one hour before the visit begins.'}</p>`;
      const guestReservationUrl = `${appUrl}/reservations?bookingId=${encodeURIComponent(booking.id)}`;
      const hostReservationUrl = `${appUrl}/host-reservations?propertyId=${encodeURIComponent(property.id)}&bookingId=${encodeURIComponent(booking.id)}`;
      const adminReservationUrl = `${appUrl}/admin?bookingId=${encodeURIComponent(booking.id)}`;
      const title = isSubscriptionPurchase ? 'Your subscription purchase is confirmed' : 'Your reservation is confirmed';
      if (guestResult.user?.email) recipients.push({
        email: guestResult.user.email,
        subject: `${isSubscriptionPurchase ? 'Subscription purchase confirmed' : 'Reservation confirmed'}: ${property.name || 'ROVAH private space'}`,
        html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5"><h1>${title}</h1>${visitDetails}${subscriptionDetails}${actionLink(guestReservationUrl, 'View in ROVAH')}${facebookLink}</div>`,
      });
      if (hostResult.user?.email) recipients.push({
        email: hostResult.user.email,
        subject: `${isSubscriptionPurchase ? 'Subscription purchased' : 'New reservation'}: ${property.name || 'your ROVAH site'}`,
        html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5"><h1>${isSubscriptionPurchase ? 'A guest purchased a subscription' : 'You have a new reservation'}</h1>${visitDetails}${subscriptionDetails}${actionLink(hostReservationUrl, 'View in ROVAH')}${facebookLink}</div>`,
      });
      recipients.push({
        email: administratorEmail,
        subject: `${isSubscriptionPurchase ? 'New ROVAH subscription purchase' : 'New ROVAH reservation'}: ${property.name || 'private space'}`,
        html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5"><h1>${isSubscriptionPurchase ? 'Subscription purchase recorded' : 'New reservation recorded'}</h1>${visitDetails}${subscriptionDetails}${actionLink(adminReservationUrl, 'Open ROVAH administration')}</div>`,
      });
    }

    if (type === 'message_created') {
      const { data: message, error } = await service
        .from('property_messages')
        .select('id, sender_id, conversation_id, message_text, image_path, property_conversations(id, property_id, guest_id, host_id, properties(name))')
        .eq('id', resourceId)
        .maybeSingle();
      if (error || !message || message.sender_id !== user.id) return json({ error: 'Message not found' }, 404);
      const conversation = Array.isArray(message.property_conversations) ? message.property_conversations[0] : message.property_conversations;
      if (!conversation) return json({ error: 'Conversation not found' }, 404);
      const recipientId = message.sender_id === conversation.guest_id ? conversation.host_id : conversation.guest_id;
      const { data: recipientResult } = await service.auth.admin.getUserById(recipientId);
      const property = Array.isArray(conversation.properties) ? conversation.properties[0] : conversation.properties;
      const siteName = escapeHtml(property?.name || 'a ROVAH private space');
      const messagesUrl = `${appUrl}/messages/${encodeURIComponent(conversation.property_id)}?conversationId=${encodeURIComponent(conversation.id)}`;
      const messageText = message.message_text?.trim();
      const messagePreview = messageText
        ? `<div style="background:#f3f0e7;border-radius:8px;margin:16px 0;padding:14px">${escapeHtml(messageText).replace(/\n/g, '<br />')}</div>`
        : '<p><em>A photo was shared. Open the conversation in ROVAH to view it.</em></p>';
      if (recipientResult.user?.email) recipients.push({
        email: recipientResult.user.email,
        subject: `New ROVAH message about ${property?.name || 'your reservation'}`,
        html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5"><h1>You have a new message</h1><p>You have a new message about ${siteName} in ROVAH.</p><p><strong>Message:</strong></p>${messagePreview}${actionLink(messagesUrl, 'Reply in ROVAH')}</div>${facebookLink}`,
      });
    }

    if (type === 'host_profile_created') {
      if (user.id !== resourceId) return json({ error: 'Unauthorized' }, 403);
      const { data: hostProfile } = await service
        .from('host_profiles')
        .select('full_name, email')
        .eq('user_id', resourceId)
        .maybeSingle();
      const hostName = escapeHtml(hostProfile?.full_name || user.email || 'A new host');
      const hostEmail = escapeHtml(hostProfile?.email || user.email || 'No email available');
      recipients.push({
        email: administratorEmail,
        subject: 'New ROVAH host profile created',
        html: `<div style="font-family:Arial,sans-serif;color:#233d28;line-height:1.5"><h1>A new host profile was created</h1><p><strong>${hostName}</strong> created a host profile (${hostEmail}).</p><p><a href="${appUrl}/admin">Open administrator review</a></p></div>`,
      });
    }

    for (const recipient of recipients) {
      const normalizedEmail = recipient.email.trim().toLowerCase();
      if (!normalizedEmail) continue;
      const { error: logError } = await service.from('app_email_notifications').insert({
        event_type: type,
        resource_id: resourceId,
        recipient_email: normalizedEmail,
      });
      if (logError) {
        if (logError.code === '23505') continue;
        console.error('Notification delivery log failed', logError.message);
        continue;
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `ROVAH <${fromEmail}>`, to: [normalizedEmail], subject: recipient.subject, html: recipient.html }),
      });
      if (!response.ok) {
        console.error('Resend rejected notification', await response.text());
        await service.from('app_email_notifications').delete().eq('event_type', type).eq('resource_id', resourceId).eq('recipient_email', normalizedEmail);
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Non-blocking notification failed', error);
    return json({ ok: true, sent: false });
  }
});
