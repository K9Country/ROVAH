import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';

const stripeCoreVersion = '2026-06-24.dahlia';
const accountRequirementsUpdated = 'v2.core.account[requirements].updated';

type StripeThinNotification = { id?: string };
type StripeV2Event = {
  id?: string;
  type?: string;
  context?: string | null;
  related_object?: { id?: string; type?: string } | null;
};

function stripeHeaders(secretKey: string, context?: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': stripeCoreVersion,
  };
  // V2 events can carry an account context. Preserve it when Stripe requires
  // it to retrieve the related resource, but never take account ownership from
  // the notification itself.
  if (context) headers['Stripe-Context'] = context;
  return headers;
}

async function retrieveV2Event({ secretKey, eventId }: { secretKey: string; eventId: string }) {
  const response = await fetch(
    `https://api.stripe.com/v2/core/events/${encodeURIComponent(eventId)}`,
    { headers: stripeHeaders(secretKey) },
  );
  const event = await response.json().catch(() => ({})) as StripeV2Event & { error?: { message?: string } };
  if (!response.ok) throw new Error(event.error?.message ?? 'Unable to retrieve the Stripe event');
  return event;
}

async function retrieveAndSyncPayoutStatus({
  admin,
  secretKey,
  accountId,
  context,
}: {
  admin: ReturnType<typeof createClient>;
  secretKey: string;
  accountId: string;
  context?: string | null;
}) {
  // Thin notifications are intentionally not authoritative resource snapshots.
  // Fetch the current Account v2 state before changing a host's payout status.
  const response = await fetch(
    `https://api.stripe.com/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.recipient`,
    { headers: stripeHeaders(secretKey, context) },
  );
  const account = await response.json().catch(() => ({})) as {
    configuration?: { recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } } };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(account.error?.message ?? 'Unable to verify the connected payout account');

  const transferStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  const payoutStatus = transferStatus === 'active' ? 'active' : transferStatus === 'inactive' ? 'restricted' : 'pending';
  const { error } = await admin
    .from('host_profiles')
    .update({ payout_status: payoutStatus })
    .eq('stripe_connected_account_id', accountId);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const thinWebhookSecret = Deno.env.get('STRIPE_THIN_WEBHOOK_SECRET');
  if (!stripeSecretKey || !thinWebhookSecret) return new Response('Thin webhook is not configured', { status: 503 });

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) return new Response('Missing Stripe signature', { status: 400 });

    // Stripe verifies the raw Thin notification before we inspect its event ID.
    const stripe = new Stripe(stripeSecretKey);
    const notification = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      thinWebhookSecret,
    ) as StripeThinNotification;
    if (!notification.id) throw new Error('Thin notification has no event ID');

    // A Thin event has no usable event.data.object. Retrieve the canonical V2
    // event and only accept the explicit account-requirements event type.
    const event = await retrieveV2Event({ secretKey: stripeSecretKey, eventId: notification.id });
    if (event.type !== accountRequirementsUpdated) return new Response('ignored', { status: 200 });

    const accountId = event.related_object?.id;
    if (!accountId || event.related_object?.type !== 'core.account') {
      throw new Error('Account requirements event has no related core account');
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await retrieveAndSyncPayoutStatus({
      admin,
      secretKey: stripeSecretKey,
      accountId,
      context: event.context,
    });

    return new Response('ok', { status: 200 });
  } catch (error) {
    // Do not log the raw payload or signature. Stripe will retry a non-2xx
    // response, which is correct for a transient retrieve/sync failure.
    console.error('stripe-thin-webhook', error instanceof Error ? error.message : error);
    return new Response('Invalid thin webhook', { status: 400 });
  }
});
