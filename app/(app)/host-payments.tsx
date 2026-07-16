import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModeLabel } from '../../components/mode-label';
import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type PaymentBooking = {
  id: string;
  total_amount: number;
  status: 'confirmed' | 'cancelled';
  payment_status:
    | 'pending_configuration'
    | 'processing'
    | 'paid'
    | 'refunded'
    | 'failed'
    | 'cancelled';
};

type HostPayoutProfile = {
  payout_status: 'not_connected' | 'pending' | 'active' | 'restricted';
};

export default function HostPaymentsScreen() {
  const { session } = useAuth();
  const [bookings, setBookings] = useState<PaymentBooking[]>([]);
  const [payoutStatus, setPayoutStatus] =
    useState<HostPayoutProfile['payout_status']>('not_connected');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPaymentReadiness = useCallback(async () => {
    if (!session?.user.id) {
      setBookings([]);
      setPayoutStatus('not_connected');
      return;
    }

    const [bookingsResult, profileResult] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, total_amount, status, payment_status')
        .eq('status', 'confirmed'),
      supabase
        .from('host_profiles')
        .select('payout_status')
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ]);

    if (bookingsResult.error) {
      throw bookingsResult.error;
    }

    if (profileResult.error) {
      throw profileResult.error;
    }

    setBookings((bookingsResult.data ?? []) as PaymentBooking[]);
    setPayoutStatus(profileResult.data?.payout_status ?? 'not_connected');
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
    [bookings]
  );
  const paidValue = useMemo(
    () =>
      bookings
        .filter((booking) => booking.payment_status === 'paid')
        .reduce((total, booking) => total + Number(booking.total_amount), 0),
    [bookings]
  );
  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.payment_status === 'pending_configuration').length,
    [bookings]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ModeLabel mode="Host" page={8} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#263A24"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Host Mode</Text>
        </Pressable>
        <Text style={styles.title}>Earnings & Payouts</Text>
        <Text style={styles.description}>
          Your payment records are ready for Stripe. No card information is stored in K9 Country.
        </Text>

        <View style={styles.setupCard}>
          <Text style={styles.setupEyebrow}>STRIPE CONNECTION</Text>
          <Text style={styles.setupTitle}>
            {payoutStatus === 'active' ? 'Payouts connected' : 'Payout setup pending'}
          </Text>
          <Text style={styles.setupText}>
            Stripe onboarding will be enabled here once the K9 Country Stripe credentials are connected. Until then, no guest payments or host payouts are processed.
          </Text>
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
                <Text style={styles.summaryLabel}>PAID OUT</Text>
                <Text style={styles.summaryValue}>${paidValue.toFixed(2)}</Text>
                <Text style={styles.summaryNote}>Stripe will manage this</Text>
              </View>
            </View>

            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>
                {pendingCount} {pendingCount === 1 ? 'reservation is' : 'reservations are'} awaiting Stripe setup
              </Text>
              <Text style={styles.pendingText}>
                These are test reservations. Their scheduled times remain protected, but no payment is collected until Stripe checkout is activated.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 10 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  setupCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginTop: 24, padding: 18 },
  setupEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  setupTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginTop: 6 },
  setupText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  summaryRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  summaryCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, padding: 15 },
  summaryLabel: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: colors.forest, fontSize: 22, fontWeight: '900', marginTop: 7 },
  summaryNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  pendingCard: { backgroundColor: '#FFF7E9', borderColor: '#E6C98D', borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 18 },
  pendingTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  pendingText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  loadingState: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { color: colors.muted, fontSize: 15, marginTop: 14 },
});
