import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type BookingProperty = {
  name: string;
  city: string;
  state: string;
};

type GuestBooking = {
  id: string;
  property_id: string;
  start_at: string;
  end_at: string;
  dog_count: number;
  total_amount: number;
  status: 'confirmed' | 'cancelled';
  payment_status: 'pending_configuration' | 'processing' | 'paid' | 'refunded' | 'failed' | 'cancelled';
  properties: BookingProperty | null;
  dogs: BookingDog[];
};

type BookingDog = {
  dog_profile_id: string | null;
  name: string;
  photo_url: string | null;
};

const cancellationWindowMs = 60 * 60 * 1000;

function formatVisitDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatVisitTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ReservationsScreen() {
  const { session } = useAuth();
  const [bookings, setBookings] = useState<GuestBooking[]>([]);
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(
    null
  );
  const [bookingToCancelId, setBookingToCancelId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const loadBookings = useCallback(async () => {
    if (!session?.user.id) {
      setBookings([]);
      setReviewedBookingIds(new Set());
      setIsLoading(false);
      return;
    }

    const [bookingResult, reviewResult, dogProfileResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, property_id, start_at, end_at, dog_count, total_amount, status, payment_status, properties(name, city, state)'
        )
        .eq('guest_id', session.user.id)
        .order('start_at', { ascending: true }),
      supabase
        .from('booking_reviews')
        .select('booking_id')
        .eq('reviewer_id', session.user.id)
        .eq('review_type', 'guest_to_host'),
      supabase
        .from('dog_profiles')
        .select('id, photo_path')
        .eq('user_id', session.user.id),
    ]);

    if (bookingResult.error) {
      Alert.alert('Unable to load reservations', bookingResult.error.message);
      setBookings([]);
      return;
    }

    const bookingIds = (bookingResult.data ?? []).map((booking) => booking.id);
    const { data: bookingDogs, error: bookingDogsError } = bookingIds.length
      ? await supabase
        .from('booking_dogs')
        .select('booking_id, dog_profile_id, name')
        .in('booking_id', bookingIds)
      : { data: [], error: null };

    if (bookingDogsError) {
      Alert.alert('Unable to load reservation dog details', bookingDogsError.message);
    }

    const dogPhotoUrls = new Map<string, string>();
    await Promise.all((dogProfileResult.data ?? []).map(async (dog) => {
      if (!dog.photo_path) return;
      const { data: signedPhoto } = await supabase.storage
        .from('dog-profile-images')
        .createSignedUrl(dog.photo_path, 60 * 60);
      if (signedPhoto?.signedUrl) dogPhotoUrls.set(dog.id, signedPhoto.signedUrl);
    }));

    const dogsByBookingId = new Map<string, BookingDog[]>();
    (bookingDogs ?? []).forEach((dog) => {
      const dogs = dogsByBookingId.get(dog.booking_id) ?? [];
      dogs.push({
        dog_profile_id: dog.dog_profile_id,
        name: dog.name,
        photo_url: dog.dog_profile_id ? dogPhotoUrls.get(dog.dog_profile_id) ?? null : null,
      });
      dogsByBookingId.set(dog.booking_id, dogs);
    });

    const bookingRows = (bookingResult.data ?? []).map((booking) => ({
      ...booking,
      properties: Array.isArray(booking.properties)
        ? booking.properties[0] ?? null
        : booking.properties,
      dogs: dogsByBookingId.get(booking.id) ?? [],
    }));
    setBookings(bookingRows as GuestBooking[]);
    setReviewedBookingIds(new Set((reviewResult.data ?? []).map((review) => review.booking_id)));
  }, [session?.user.id]);

  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        await loadBookings();
      } finally {
        setIsLoading(false);
      }
    };

    void initialize();
  }, [loadBookings]);

  useEffect(() => {
    const refreshClock = setInterval(
      () => setCurrentTime(Date.now()),
      30_000
    );
    return () => clearInterval(refreshClock);
  }, []);

  const upcomingBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === 'confirmed' &&
          new Date(booking.start_at).getTime() > currentTime
      ),
    [bookings, currentTime]
  );

  const startedBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === 'confirmed' &&
          new Date(booking.start_at).getTime() <= currentTime &&
          new Date(booking.end_at).getTime() > currentTime
      ),
    [bookings, currentTime]
  );

  const historyBookings = useMemo(
    () =>
      bookings
        .filter((booking) => !upcomingBookings.some((upcoming) => upcoming.id === booking.id) && !startedBookings.some((started) => started.id === booking.id))
        .sort(
          (first, second) =>
            new Date(second.start_at).getTime() -
            new Date(first.start_at).getTime()
        ),
    [bookings, startedBookings, upcomingBookings]
  );

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadBookings();
    } finally {
      setIsRefreshing(false);
    }
  };

  const canCancel = (booking: GuestBooking) =>
    booking.status === 'confirmed' &&
    new Date(booking.start_at).getTime() - currentTime >= cancellationWindowMs;

  const cancelBooking = async (booking: GuestBooking) => {
    try {
      setCancellingBookingId(booking.id);
      const { data, error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id)
        .eq('guest_id', session?.user.id ?? '')
        .eq('status', 'confirmed')
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        Alert.alert(
          'Cancellation unavailable',
          'The one-hour cancellation window has closed or this reservation was already changed.'
        );
        await loadBookings();
        return;
      }

      setBookingToCancelId(null);
      await loadBookings();
    } catch (error) {
      Alert.alert(
        'Unable to cancel reservation',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setCancellingBookingId(null);
    }
  };

  const renderBooking = (booking: GuestBooking, isUpcoming: boolean, isStarted = false) => {
    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);
    const propertyName = booking.properties?.name ?? 'Private space';
    const propertyLocation = booking.properties
      ? `${booking.properties.city}, ${booking.properties.state}`
      : 'K9 Country listing';
    const cancellationAvailable = canCancel(booking);
    const isCancelling = cancellingBookingId === booking.id;
    const isConfirmingCancellation = bookingToCancelId === booking.id;

    return (
      <View key={booking.id} style={styles.bookingCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeading}>
            <Text style={styles.propertyName}>{propertyName}</Text>
            <Text style={styles.propertyLocation}>{propertyLocation}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              booking.status === 'cancelled'
                ? styles.cancelledBadge
                : isStarted
                  ? styles.startedBadge
                : styles.confirmedBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                booking.status === 'cancelled'
                  ? styles.cancelledStatusText
                  : styles.confirmedStatusText,
              ]}
            >
              {booking.status === 'cancelled' ? 'Cancelled' : isStarted ? 'Started' : 'Confirmed'}
            </Text>
          </View>
        </View>

        <Text style={styles.visitDate}>{formatVisitDate(start)}</Text>
        <Text style={styles.visitTime}>
          {formatVisitTime(start)} – {formatVisitTime(end)}
        </Text>
        <Text style={styles.visitDetails}>
          {booking.dog_count} {booking.dog_count === 1 ? 'dog' : 'dogs'} · ${Number(booking.total_amount).toFixed(2)}
        </Text>
        <Text style={styles.paymentStatusText}>
          {booking.payment_status === 'paid'
            ? 'Payment received'
            : booking.payment_status === 'cancelled'
              ? 'No payment collected'
              : 'Payment setup pending — no money collected'}
        </Text>

        {booking.dogs.length ? <View style={styles.dogsSection}>
          <Text style={styles.dogsSectionTitle}>Dogs attending</Text>
          <View style={styles.dogList}>
            {booking.dogs.map((dog, index) => <View key={`${booking.id}-${dog.dog_profile_id ?? dog.name}-${index}`} style={styles.dogRow}>
              {dog.photo_url ? <Image accessibilityLabel={`${dog.name}'s photo`} source={{ uri: dog.photo_url }} style={styles.dogPhoto} /> : <View style={styles.dogPhotoFallback}><Text style={styles.dogPhotoFallbackText}>{dog.name.slice(0, 1).toUpperCase()}</Text></View>}
              <View style={styles.dogCopy}>
                <Text style={styles.dogName}>{dog.name}</Text>
              </View>
            </View>)}
          </View>
        </View> : null}

        {(isUpcoming || isStarted) && booking.status === 'confirmed' ? (
          <>
            {isStarted ? <Text style={styles.visitStartedText}>Your visit is in progress.</Text> : cancellationAvailable ? (
              isConfirmingCancellation ? (
                <View style={styles.cancelConfirmation}>
                  <Text style={styles.cancelConfirmationText}>
                    Cancel this reservation? You may cancel until one hour before the visit.
                  </Text>
                  <View style={styles.cancelConfirmationActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isCancelling}
                      onPress={() => setBookingToCancelId(null)}
                      style={({ pressed }) => [styles.keepButton, pressed && styles.buttonPressed, isCancelling && styles.buttonDisabled]}
                    >
                      <Text style={styles.keepButtonText}>Keep it</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isCancelling}
                      onPress={() => void cancelBooking(booking)}
                      style={({ pressed }) => [styles.confirmCancelButton, pressed && styles.buttonPressed, isCancelling && styles.buttonDisabled]}
                    >
                      {isCancelling ? <ActivityIndicator color={colors.cream} size="small" /> : <Text style={styles.confirmCancelButtonText}>Yes, cancel</Text>}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={isCancelling}
                  onPress={() => setBookingToCancelId(booking.id)}
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                    isCancelling && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.cancelButtonText}>Cancel Reservation</Text>
                </Pressable>
              )
            ) : (
              <Text style={styles.windowClosedText}>
                The cancellation window closed one hour before this visit.
              </Text>
            )}

            <Pressable
              accessibilityLabel={`Message the host of ${propertyName}`}
              accessibilityRole="button"
              onPress={() => router.push(`/messages/${booking.property_id}` as never)}
              style={({ pressed }) => [
                styles.messageHostButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.messageHostButtonText}>Message Host</Text>
              <Text style={styles.messageHostIcon}>💬</Text>
            </Pressable>
          </>
        ) : null}

        {!isUpcoming && !isStarted && booking.status === 'confirmed' ? (
          reviewedBookingIds.has(booking.id) ? <View style={styles.reviewComplete}><Text style={styles.reviewCompleteText}>★ Review complete</Text></View> : <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/review?bookingId=${booking.id}&direction=guest_to_host` as never)}
              style={({ pressed }) => [styles.reviewButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.reviewButtonText}>Review My Visit</Text>
            </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor="#263A24"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>My Reservations</Text>
        <Text style={styles.description}>
          Started visits appear first, followed by upcoming reservations. Completed visits are ready for review.
        </Text>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#263A24" size="large" />
            <Text style={styles.loadingText}>Loading your reservations...</Text>
          </View>
        ) : (
          <>
            {startedBookings.length > 0 ? <>
              <Text style={styles.sectionTitle}>Started</Text>
              {startedBookings.map((booking) => renderBooking(booking, false, true))}
            </> : null}

            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingBookings.length > 0 ? (
              upcomingBookings.map((booking) => renderBooking(booking, true))
            ) : (
              <>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No upcoming reservations</Text>
                  <Text style={styles.emptyText}>
                    Your next private-space visit will appear here.
                  </Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.push('/search')} style={styles.searchPropertiesButton}>
                  <Text style={styles.searchPropertiesButtonText}>Make a reservation</Text>
                </Pressable>
              </>
            )}

            {historyBookings.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Completed & Cancelled</Text>
                {historyBookings.map((booking) => renderBooking(booking, false))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', marginBottom: 12, minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginTop: 14 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 6 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 24, marginTop: 10 },
  sectionTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginBottom: 12, marginTop: 4 },
  bookingCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 14, padding: 17 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardHeading: { flex: 1, paddingRight: 10 },
  propertyName: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  propertyLocation: { color: colors.muted, fontSize: 13, marginTop: 4 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  confirmedBadge: { backgroundColor: colors.lightGreen },
  startedBadge: { backgroundColor: '#FFF5E8' },
  cancelledBadge: { backgroundColor: '#F0C5C0' },
  statusText: { fontSize: 11, fontWeight: '900' },
  confirmedStatusText: { color: '#3D522C' },
  cancelledStatusText: { color: '#95423A' },
  visitDate: { color: colors.forest, fontSize: 16, fontWeight: '900', marginTop: 18 },
  visitTime: { color: colors.brown, fontSize: 15, fontWeight: '800', marginTop: 4 },
  visitDetails: { color: colors.muted, fontSize: 14, marginTop: 7 },
  paymentStatusText: { color: colors.muted, fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginTop: 5 },
  dogsSection: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  dogsSectionTitle: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: 10 },
  dogList: { gap: 10 },
  dogRow: { alignItems: 'center', backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 14, borderWidth: 1, flexDirection: 'row', padding: 10 },
  dogPhoto: { borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 44, marginRight: 10, width: 44 },
  dogPhotoFallback: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 10, width: 44 },
  dogPhotoFallbackText: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  dogCopy: { flex: 1 },
  dogName: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  cancelButton: { alignItems: 'center', backgroundColor: '#FFF1EE', borderColor: '#D88A80', borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 48 },
  cancelButtonText: { color: '#95423A', fontSize: 15, fontWeight: '900' },
  cancelConfirmation: { backgroundColor: '#FFF1EE', borderColor: '#D88A80', borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 14 },
  cancelConfirmationText: { color: colors.forest, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  cancelConfirmationActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  keepButton: { alignItems: 'center', backgroundColor: colors.cream, borderColor: '#D88A80', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42 },
  keepButtonText: { color: '#95423A', fontSize: 14, fontWeight: '900' },
  confirmCancelButton: { alignItems: 'center', backgroundColor: '#95423A', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42 },
  confirmCancelButtonText: { color: colors.cream, fontSize: 14, fontWeight: '900' },
  messageHostButton: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: 10, minHeight: 48 },
  messageHostButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  messageHostIcon: { fontSize: 17, marginLeft: 8 },
  reviewButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 10, minHeight: 48 },
  reviewButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  reviewComplete: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 48 },
  reviewCompleteText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  visitStartedText: { color: colors.brown, fontSize: 13, fontWeight: '800', marginTop: 16 },
  windowClosedText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.6 },
  emptyCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginBottom: 22, padding: 18 },
  emptyTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  searchPropertiesButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginBottom: 22, marginTop: -10, minHeight: 48, paddingHorizontal: 20 },
  searchPropertiesButtonText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  loadingState: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { color: colors.muted, fontSize: 15, marginTop: 14 },
});
