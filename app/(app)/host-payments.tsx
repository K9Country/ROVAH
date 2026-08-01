import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { HostPageGuide } from '../../components/host-page-guide';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type PaymentBooking = {
  id: string;
  total_amount: number;
  status: 'confirmed' | 'completed' | 'cancelled';
  payment_status: 'pending_configuration' | 'processing' | 'paid' | 'refunded' | 'failed' | 'cancelled';
};

type PayoutStatus = 'not_connected' | 'pending' | 'active' | 'restricted';

type BookingSettlement = {
  booking_id: string;
  reservation_total_amount: number;
  stripe_processing_fee_amount: number;
  host_payout_amount: number;
  settlement_status: 'settled' | 'reversed' | 'transfer_reversal_required';
};

export default function HostPaymentsScreen() {
  const { session } = useAuth();
  const { stripe } = useLocalSearchParams<{ stripe?: string }>();
  const [bookings, setBookings] = useState<PaymentBooking[]>([]);
  const [settlements, setSettlements] = useState<BookingSettlement[]>([]);
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus>('not_connected');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPayoutActionLoading, setIsPayoutActionLoading] = useState(false);
  const [payoutSetupAvailable, setPayoutSetupAvailable] = useState(false);
  const [payoutSetupMessage, setPayoutSetupMessage] = useState<string | null>(null);

  const loadPaymentReadiness = useCallback(async () => {
    if (!session?.user.id) {
      setBookings([]);
      setSettlements([]);
      setPayoutStatus('not_connected');
      setPayoutSetupAvailable(false);
      return;
    }

    const [bookingsResult, profileResult, settlementsResult, payoutStatusResult] = await Promise.all([
      supabase.from('bookings').select('id, total_amount, status, payment_status').in('status', ['confirmed', 'completed']),
      supabase.from('host_profiles').select('payout_status').eq('user_id', session.user.id).maybeSingle(),
      supabase
        .from('booking_payout_settlements')
        .select('booking_id, reservation_total_amount, stripe_processing_fee_amount, host_payout_amount, settlement_status')
        .eq('settlement_status', 'settled'),
      supabase.functions.invoke('get-host-payout-status'),
    ]);

    if (bookingsResult.error) throw bookingsResult.error;
    if (profileResult.error) throw profileResult.error;
    if (settlementsResult.error) throw settlementsResult.error;

    setBookings((bookingsResult.data ?? []) as PaymentBooking[]);
    setSettlements((settlementsResult.data ?? []) as BookingSettlement[]);
    const serverPayoutStatus = payoutStatusResult.data?.status;
    setPayoutStatus(
      serverPayoutStatus === 'not_connected' || serverPayoutStatus === 'pending' || serverPayoutStatus === 'active' || serverPayoutStatus === 'restricted'
        ? serverPayoutStatus
        : (profileResult.data?.payout_status as PayoutStatus | undefined) ?? 'not_connected',
    );
    setPayoutSetupAvailable(Boolean(payoutStatusResult.data?.setupAvailable));
    setPayoutSetupMessage(
      payoutStatusResult.error
        ? 'Stripe payout setup is not configured yet. No bank or tax information is collected in ROVAH.'
        : null,
    );
  }, [session?.user.id]);

  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        await loadPaymentReadiness();
      } finally {
        setIsLoading(false);
      }
    };
    void initialize();
  }, [loadPaymentReadiness]);

  const openExternalUrl = async (url: string) => {
    if (!await Linking.canOpenURL(url)) {
      throw new Error('Your device could not open the secure Stripe page. Please try again.');
    }
    await Linking.openURL(url);
  };

  const getFunctionErrorMessage = async (error: unknown) => {
    const response = (error as { context?: { clone?: () => Response; json?: () => Promise<unknown> } } | null)?.context;
    if (response?.json) {
      const readableResponse = response.clone ? response.clone() : response;
      const payload = await readableResponse.json!().catch(() => null) as { error?: unknown } | null;
      if (typeof payload?.error === 'string') return payload.error;
    }
    return error instanceof Error ? error.message : null;
  };

  const startPayoutSetup = useCallback(async () => {
    try {
      setIsPayoutActionLoading(true);
      setPayoutSetupMessage(null);
      const { data, error } = await supabase.functions.invoke('start-host-payout-onboarding');
      if (error || !data?.onboardingUrl) {
        const functionMessage = error ? await getFunctionErrorMessage(error) : null;
        throw new Error(data?.error ?? functionMessage ?? 'Unable to start secure payout setup.');
      }
      await openExternalUrl(data.onboardingUrl);
    } catch (error) {
      setPayoutSetupMessage(error instanceof Error ? error.message : 'Unable to start secure payout setup.');
    } finally {
      setIsPayoutActionLoading(false);
    }
  }, []);

  const openExpressDashboard = useCallback(async () => {
    try {
      setIsPayoutActionLoading(true);
      setPayoutSetupMessage(null);
      const { data, error } = await supabase.functions.invoke('create-host-express-dashboard-link');
      if (error || !data?.dashboardUrl) {
        throw new Error(data?.error ?? error?.message ?? 'Unable to open the Stripe payout dashboard.');
      }
      await openExternalUrl(data.dashboardUrl);
    } catch (error) {
      setPayoutSetupMessage(error instanceof Error ? error.message : 'Unable to open the Stripe payout dashboard.');
    } finally {
      setIsPayoutActionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user.id || (stripe !== 'return' && stripe !== 'refresh')) return;
    if (stripe === 'refresh') {
      void startPayoutSetup();
      return;
    }
    void loadPaymentReadiness();
  }, [loadPaymentReadiness, session?.user.id, startPayoutSetup, stripe]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadPaymentReadiness();
    } finally {
      setIsRefreshing(false);
    }
  };

  const bookingValue = useMemo(
    () => bookings.reduce((total, booking) => total + Number(booking.total_amount), 0),
    [bookings],
  );
  const settledBookingIds = useMemo(() => new Set(bookings.map((booking) => booking.id)), [bookings]);
  const paidValue = useMemo(
    () => settlements.reduce((total, settlement) => settledBookingIds.has(settlement.booking_id) ? total + Number(settlement.host_payout_amount) : total, 0),
    [settledBookingIds, settlements],
  );
  const stripeProcessingFees = useMemo(
    () => settlements.reduce((total, settlement) => settledBookingIds.has(settlement.booking_id) ? total + Number(settlement.stripe_processing_fee_amount) : total, 0),
    [settledBookingIds, settlements],
  );
  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.payment_status === 'pending_configuration').length,
    [bookings],
  );

  const payoutTitle = payoutStatus === 'active'
    ? 'Payouts connected'
    : payoutStatus === 'restricted'
      ? 'Payout setup needs attention'
      : 'Payout setup pending';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#263A24" />}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Host Dashboard</Text>
        </Pressable>
        <Text style={styles.title}>Earnings & Payouts</Text>
        <Text style={styles.description}>Your payment records are ready for Stripe. No card information is stored in ROVAH.</Text>

        <View style={styles.setupCard}>
          <Text style={styles.setupEyebrow}>STRIPE CONNECTION</Text>
          <Text style={styles.setupTitle}>{payoutTitle}</Text>
          <Text style={styles.setupText}>
            {payoutStatus === 'active'
              ? 'Your Stripe payout account is ready. Completed paid visits are included in your monthly host payout.'
              : 'Use Stripe’s secure hosted setup to provide the verification and bank details needed for monthly host payouts. ROVAH does not store those details.'}
          </Text>
          {payoutSetupMessage ? <Text style={styles.setupMessage}>{payoutSetupMessage}</Text> : null}
          {payoutStatus === 'active' ? (
            <Pressable
              accessibilityRole="button"
              disabled={isPayoutActionLoading}
              onPress={openExpressDashboard}
              style={({ pressed }) => [styles.setupButton, pressed && styles.buttonPressed, isPayoutActionLoading && styles.buttonDisabled]}
            >
              {isPayoutActionLoading ? <ActivityIndicator color="#FFFDF8" /> : <Text style={styles.setupButtonText}>Open Stripe Payout Dashboard</Text>}
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={isPayoutActionLoading || !payoutSetupAvailable}
              onPress={startPayoutSetup}
              style={({ pressed }) => [styles.setupButton, pressed && styles.buttonPressed, (isPayoutActionLoading || !payoutSetupAvailable) && styles.buttonDisabled]}
            >
              {isPayoutActionLoading ? <ActivityIndicator color="#FFFDF8" /> : <Text style={styles.setupButtonText}>{payoutSetupAvailable ? 'Set Up Secure Stripe Payouts' : 'Stripe Setup Coming Soon'}</Text>}
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#263A24" size="large" />
            <Text style={styles.loadingText}>Loading payment readiness...</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>BOOKING VALUE</Text>
                <Text style={styles.summaryValue}>${bookingValue.toFixed(2)}</Text>
                <Text style={styles.summaryNote}>Not collected yet</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>FINAL HOST PAYOUT</Text>
                <Text style={styles.summaryValue}>${paidValue.toFixed(2)}</Text>
                <Text style={styles.summaryNote}>After ROVAH and Stripe fees</Text>
              </View>
            </View>
            <Text style={styles.settlementNote}>Stripe processing fees settled so far: ${stripeProcessingFees.toFixed(2)}. Final payout amounts use each successful payment’s actual Stripe fee.</Text>
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>{pendingCount} {pendingCount === 1 ? 'reservation is' : 'reservations are'} awaiting Stripe setup</Text>
              <Text style={styles.pendingText}>These reservations are not paid reservations. Their scheduled times remain protected, but no payment is collected until Stripe checkout is activated.</Text>
            </View>
          </>
        )}
        <HostPageGuide title="How to use Payments" intro="This page shows the money from your reservations and whether Stripe is ready to pay you." steps={[{ title: 'Finish Stripe setup', text: 'If you see a setup button, tap it and answer Stripe’s questions. You cannot receive payouts until Stripe says your account is active.' }, { title: 'Read the totals', text: 'Completed reservations add to the totals. Final host payout is the money left after ROVAH and Stripe fees.' }, { title: 'Watch pending reservations', text: 'Pending means the reservation is protected but not paid. Finish any Stripe setup shown on this page to solve it.' }]} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  setupCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginTop: 24, padding: 18 },
  setupEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  setupTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginTop: 6 },
  setupText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  setupMessage: { color: '#8B3A2A', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 10 },
  setupButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, marginTop: 15, minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
  setupButtonText: { color: '#FFFDF8', fontSize: 14, fontWeight: '900' },
  buttonPressed: { opacity: 0.86 },
  buttonDisabled: { opacity: 0.5 },
  summaryRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  summaryCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, padding: 15 },
  summaryLabel: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: colors.forest, fontSize: 22, fontWeight: '900', marginTop: 7 },
  summaryNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  settlementNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  pendingCard: { backgroundColor: '#FFF7E9', borderColor: '#E6C98D', borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 18 },
  pendingTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  pendingText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  loadingState: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { color: colors.muted, fontSize: 15, marginTop: 14 },
});
