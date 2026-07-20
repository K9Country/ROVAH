import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type Period = 'day' | 'month' | 'year';
type Metric = 'earnings' | 'clicks' | 'bookings';
type BookingRow = { property_id: string; start_at: string; total_amount: number | string };
type ViewRow = { property_id: string; viewed_at: string };

const periods: Period[] = ['day', 'month', 'year'];
const metrics: { key: Metric; label: string }[] = [
  { key: 'earnings', label: 'Host earnings' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'bookings', label: 'Bookings' },
];

function bucketKey(dateValue: string, period: Period) {
  const date = new Date(dateValue);
  if (period === 'year') return String(date.getFullYear());
  if (period === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function bucketLabel(key: string, period: Period) {
  if (period === 'year') return key;
  const parts = key.split('-').map(Number);
  if (period === 'month') return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HostAnalyticsScreen() {
  const { propertyId, propertyName } = useLocalSearchParams<{ propertyId?: string; propertyName?: string }>();
  const { session } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<Metric>('earnings');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadAnalytics = useCallback(async () => {
    if (!session?.user.id) return;
    setIsLoading(true);
    setErrorMessage('');
    let bookingQuery = supabase.from('bookings').select('property_id, start_at, total_amount').eq('status', 'confirmed');
    let viewQuery = supabase.from('property_view_events').select('property_id, viewed_at');
    if (propertyId) {
      bookingQuery = bookingQuery.eq('property_id', propertyId);
      viewQuery = viewQuery.eq('property_id', propertyId);
    }
    const [bookingResult, viewResult] = await Promise.all([bookingQuery, viewQuery]);
    if (bookingResult.error || viewResult.error) {
      setErrorMessage('We could not load your analytics. Please try again.');
    } else {
      setBookings((bookingResult.data ?? []) as BookingRow[]);
      setViews((viewResult.data ?? []) as ViewRow[]);
    }
    setIsLoading(false);
  }, [propertyId, session?.user.id]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  const totalHostEarnings = useMemo(() => bookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0) * 0.85, 0), [bookings]);
  const averageHostEarnings = bookings.length ? totalHostEarnings / bookings.length : 0;
  const chartData = useMemo(() => {
    const totals = new Map<string, number>();
    const rows = metric === 'clicks' ? views : bookings;
    rows.forEach((row) => {
      const dateValue = metric === 'clicks' ? (row as ViewRow).viewed_at : (row as BookingRow).start_at;
      const key = bucketKey(dateValue, period);
      const increment = metric === 'earnings' ? Number((row as BookingRow).total_amount || 0) * 0.85 : 1;
      totals.set(key, (totals.get(key) ?? 0) + increment);
    });
    return [...totals.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([key, value]) => ({ key, label: bucketLabel(key, period), value }));
  }, [bookings, metric, period, views]);
  const chartMax = Math.max(1, ...chartData.map((item) => item.value));

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backButtonText}>Host Dashboard</Text></Pressable>
      <Text style={styles.eyebrow}>HOST ANALYTICS</Text>
      <Text style={styles.title}>{propertyName ?? 'Your performance'}</Text>
      <Text style={styles.description}>Track your 85% earnings, clicks, and reservations to understand when your site is performing best.</Text>
      <View style={styles.summaryGrid}>
        <Summary label="TOTAL HOST EARNINGS" value={`$${totalHostEarnings.toFixed(2)}`} detail="85% of confirmed bookings" />
        <Summary label="AVG. HOST EARNINGS / BOOKING" value={`$${averageHostEarnings.toFixed(2)}`} detail="Your 85% share per booking" />
      </View>
      <Text style={styles.sectionTitle}>Track performance</Text>
      <View style={styles.selectorRow}>{metrics.map((option) => <Pressable accessibilityRole="button" key={option.key} onPress={() => setMetric(option.key)} style={[styles.selector, metric === option.key && styles.selectorSelected]}><Text style={[styles.selectorText, metric === option.key && styles.selectorTextSelected]}>{option.label}</Text></Pressable>)}</View>
      <View style={styles.selectorRow}>{periods.map((option) => <Pressable accessibilityRole="button" key={option} onPress={() => setPeriod(option)} style={[styles.selector, period === option && styles.selectorSelected]}><Text style={[styles.selectorText, period === option && styles.selectorTextSelected]}>{option[0].toUpperCase() + option.slice(1)}</Text></Pressable>)}</View>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : null}
      {errorMessage ? <View style={styles.errorBanner}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
      {!isLoading && !errorMessage ? <View style={styles.chartCard}><Text style={styles.chartTitle}>{metrics.find((item) => item.key === metric)?.label} by {period}</Text>{chartData.length ? <View style={styles.chart}>{chartData.map((item) => <View key={item.key} style={styles.chartRow}><Text numberOfLines={1} style={styles.chartLabel}>{item.label}</Text><View style={styles.barTrack}><View style={[styles.bar, { width: `${Math.max(4, (item.value / chartMax) * 100)}%` }]} /></View><Text style={styles.chartValue}>{metric === 'earnings' ? `$${item.value.toFixed(0)}` : item.value}</Text></View>)}</View> : <Text style={styles.emptyText}>{metric === 'clicks' ? 'Click trends begin collecting from today forward.' : 'Confirmed reservations will appear here once you receive bookings.'}</Text>}</View> : null}
      <Text style={styles.note}>Host earnings reflect your 85% share of each confirmed reservation, including additional-dog fees. Actual payment timing will be shown when payouts are connected.</Text>
    </ScrollView>
  </SafeAreaView>;
}

function Summary({ detail, label, value }: { detail?: string; label: string; value: string }) { return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text>{detail ? <Text style={styles.summaryDetail}>{detail}</Text> : null}</View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 42 }, backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 }, backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '900' }, eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 7 }, description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }, summaryGrid: { flexDirection: 'row', gap: 10, marginTop: 22 }, summaryCard: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 17, borderWidth: 1, flex: 1, minHeight: 116, padding: 14 }, summaryLabel: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, summaryValue: { color: colors.forest, fontSize: 23, fontWeight: '900', marginTop: 10 }, summaryDetail: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, sectionTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginTop: 28, marginBottom: 10 }, selectorRow: { flexDirection: 'row', gap: 8, marginBottom: 8 }, selector: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 6 }, selectorSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, selectorText: { color: colors.forest, fontSize: 12, fontWeight: '900', textAlign: 'center' }, selectorTextSelected: { color: colors.warmWhite }, loading: { minHeight: 200, justifyContent: 'center' }, chartCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 19, borderWidth: 1, marginTop: 12, padding: 16 }, chartTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', textTransform: 'capitalize' }, chart: { gap: 14, marginTop: 18 }, chartRow: { alignItems: 'center', flexDirection: 'row' }, chartLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', width: 70 }, barTrack: { backgroundColor: '#E7E2D7', borderRadius: 7, flex: 1, height: 14, overflow: 'hidden' }, bar: { backgroundColor: colors.forest, borderRadius: 7, height: '100%' }, chartValue: { color: colors.forest, fontSize: 12, fontWeight: '900', marginLeft: 9, textAlign: 'right', width: 50 }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14 }, errorBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 13, borderWidth: 1, marginTop: 18, padding: 13 }, errorText: { color: colors.red, fontSize: 14, fontWeight: '800' }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: 'center' },
});
