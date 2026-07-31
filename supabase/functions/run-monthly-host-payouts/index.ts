import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.3.2';

type BookingRow = {
  id: string;
  settlement: {
    reservation_total_amount: number | string;
    rovah_service_fee_amount: number | string;
    stripe_processing_fee_amount: number | string;
    host_payout_amount: number | string;
  } | null;
  property: { host_id: string } | null;
};

const monthBounds = () => {
  const now = new Date();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStart = new Date(Date.UTC(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() - 1, 1));
  return { monthStart, monthEnd, payoutMonth: monthStart.toISOString().slice(0, 10) };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (req.headers.get('x-payout-runner-secret') !== Deno.env.get('PAYOUT_RUNNER_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return new Response('Stripe is not configured', { status: 503 });

  try {
    const { monthStart, monthEnd, payoutMonth } = monthBounds();
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: rows, error } = await adminClient
      .from('bookings')
      .select('id, property:properties(host_id), settlement:booking_payout_settlements(reservation_total_amount, rovah_service_fee_amount, stripe_processing_fee_amount, host_payout_amount, settlement_status, stripe_transfer_id)')
      .eq('status', 'confirmed')
      .eq('payment_status', 'paid')
      .gte('end_at', monthStart.toISOString())
      .lt('end_at', monthEnd.toISOString());
    if (error) throw error;

    const bookingsByHost = new Map<string, BookingRow[]>();
    for (const row of (rows ?? []) as BookingRow[]) {
      const settlement = Array.isArray(row.settlement) ? row.settlement[0] : row.settlement;
      if (!row.property?.host_id || !settlement || settlement.settlement_status !== 'settled' || settlement.stripe_transfer_id) continue;
      const bookings = bookingsByHost.get(row.property.host_id) ?? [];
      bookings.push({ ...row, settlement });
      bookingsByHost.set(row.property.host_id, bookings);
    }

    const stripe = new Stripe(stripeSecretKey);
    const results: Array<{ hostId: string; status: string }> = [];
    for (const [hostId, bookings] of bookingsByHost) {
      const { data: host, error: hostError } = await adminClient
        .from('host_profiles')
        .select('stripe_connected_account_id, payout_status')
        .eq('user_id', hostId)
        .maybeSingle();
      if (hostError) throw hostError;
      if (!host?.stripe_connected_account_id || host.payout_status !== 'active') {
        results.push({ hostId, status: 'host payout setup incomplete' });
        continue;
      }

      const grossCents = bookings.reduce((total, booking) => total + Math.round(Number(booking.settlement?.reservation_total_amount ?? 0) * 100), 0);
      const platformFeeCents = bookings.reduce((total, booking) => total + Math.round(Number(booking.settlement?.rovah_service_fee_amount ?? 0) * 100), 0);
      const stripeFeeCents = bookings.reduce((total, booking) => total + Math.round(Number(booking.settlement?.stripe_processing_fee_amount ?? 0) * 100), 0);
      const payoutCents = bookings.reduce((total, booking) => total + Math.round(Number(booking.settlement?.host_payout_amount ?? 0) * 100), 0);
      const { data: payout, error: payoutError } = await adminClient
        .from('host_payouts')
        .upsert({
          host_id: hostId,
          payout_month: payoutMonth,
          gross_amount: grossCents / 100,
          platform_fee_amount: platformFeeCents / 100,
          stripe_processing_fee_amount: stripeFeeCents / 100,
          payout_amount: payoutCents / 100,
          status: 'pending',
        }, { onConflict: 'host_id,payout_month' })
        .select('id, stripe_transfer_id, status')
        .single();
      if (payoutError) throw payoutError;
      if (payout.stripe_transfer_id || payout.status === 'paid') {
        results.push({ hostId, status: 'already paid' });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: payoutCents,
          currency: 'usd',
          destination: host.stripe_connected_account_id,
          metadata: { host_id: hostId, payout_month: payoutMonth, host_payout_id: payout.id },
        }, { idempotencyKey: `rovah-host-payout-${hostId}-${payoutMonth}` });

        const now = new Date().toISOString();
        const [{ error: payoutUpdateError }, { error: bookingUpdateError }, { error: settlementUpdateError }] = await Promise.all([
          adminClient.from('host_payouts').update({ status: 'paid', stripe_transfer_id: transfer.id, paid_at: now }).eq('id', payout.id),
          adminClient.from('bookings').update({ stripe_transfer_id: transfer.id }).in('id', bookings.map((booking) => booking.id)),
          adminClient.from('booking_payout_settlements').update({ stripe_transfer_id: transfer.id, updated_at: now }).in('booking_id', bookings.map((booking) => booking.id)).eq('settlement_status', 'settled').is('stripe_transfer_id', null),
        ]);
        if (payoutUpdateError || bookingUpdateError || settlementUpdateError) {
          throw payoutUpdateError ?? bookingUpdateError ?? settlementUpdateError;
        }
        results.push({ hostId, status: 'paid' });
      } catch (transferError) {
        await adminClient.from('host_payouts').update({ status: 'failed' }).eq('id', payout.id);
        console.error('host payout failed', hostId, transferError);
        results.push({ hostId, status: 'failed' });
      }
    }

    return Response.json({ payoutMonth, results });
  } catch (error) {
    console.error('run-monthly-host-payouts', error);
    return new Response('Unable to process host payouts', { status: 500 });
  }
});
