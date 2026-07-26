import { router, useLocalSearchParams } from 'expo-router';
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

import { ModeLabel } from '../../../components/mode-label';
import { colors, shadows, typography } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../services/auth-context';
import type { BookingReview, ReviewAnswer } from '../../../types/review';

type GuestBooking = {
  id: string;
  property_id: string;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'cancelled';
  properties: { name: string; city: string; state: string } | null;
};

function formatAnswer(answer: ReviewAnswer) {
  if (answer === 'yes') return 'Yes';
  if (answer === 'no') return 'No';
  return 'Not sure';
}

function formatAverage(reviews: BookingReview[]) {
  if (!reviews.length) return 'N/A';
  return (reviews.reduce((sum, review) => sum + review.bone_rating, 0) / reviews.length).toFixed(1);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatVisitRange(startAt: string, endAt: string) {
  const start = new Date(startAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = new Date(startAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const endTime = new Date(endAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${start} | ${startTime} - ${endTime}`;
}

function ReviewCard({
  review,
  title,
  propertyLabel,
  hostOnly = false,
}: {
  review: BookingReview;
  title: string;
  propertyLabel: string;
  hostOnly?: boolean;
}) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewHeading}>
          <Text style={styles.reviewTitle}>{title}</Text>
          <Text style={styles.reviewMeta}>{propertyLabel}</Text>
        </View>
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>★ {review.bone_rating}/5</Text>
        </View>
      </View>

      <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>

      {review.review_text ? (
        <Text style={styles.reviewText}>{review.review_text}</Text>
      ) : (
        <Text style={styles.reviewTextMuted}>No written note shared.</Text>
      )}

      {!hostOnly ? <>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Cleanliness</Text>
          <Text style={styles.detailValue}>{formatAnswer(review.cleanliness)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Fence security</Text>
          <Text style={styles.detailValue}>{formatAnswer(review.fence_security)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Nearby distractions</Text>
          <Text style={styles.detailValue}>
            {review.nearby_distractions.length ? review.nearby_distractions.join(', ') : 'None noted'}
          </Text>
        </View>
      </> : null}
      {!hostOnly && review.unexpected_encounters ? (
        <View style={styles.notesBlock}>
          <Text style={styles.detailLabel}>Unexpected encounters</Text>
          <Text style={styles.notesText}>{review.unexpected_encounters}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function HostGuestProfileScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ guestId?: string; guestName?: string }>();
  const guestId = Array.isArray(params.guestId) ? params.guestId[0] : params.guestId;
  const guestNameParam = Array.isArray(params.guestName) ? params.guestName[0] : params.guestName;
  const initialGuestName = guestNameParam ? decodeURIComponent(guestNameParam) : 'Guest';

  const [displayName, setDisplayName] = useState(initialGuestName);
  const [bookings, setBookings] = useState<GuestBooking[]>([]);
  const [hostReviews, setHostReviews] = useState<BookingReview[]>([]);
  const [guestReviews, setGuestReviews] = useState<BookingReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadGuestPage = useCallback(async () => {
    if (!session?.user.id) {
      setErrorMessage('Sign in to view guest pages.');
      setIsLoading(false);
      return;
    }

    if (!guestId) {
      setErrorMessage('This guest page could not be found.');
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const [profileResult, propertiesResult, hostReviewResult, guestReviewResult] = await Promise.all([
      supabase
        .from('messaging_profiles')
        .select('user_id, display_name')
        .eq('user_id', guestId)
        .maybeSingle(),
      supabase
        .from('properties')
        .select('id')
        .eq('host_id', session.user.id),
      supabase
        .from('booking_reviews')
        .select('*')
        .eq('reviewee_id', guestId)
        .eq('review_type', 'host_to_guest')
        .order('created_at', { ascending: false }),
      supabase
        .from('booking_reviews')
        .select('*')
        .eq('reviewer_id', guestId)
        .eq('review_type', 'guest_to_host')
        .eq('comment_visibility', 'public')
        .order('created_at', { ascending: false }),
    ]);

    const firstError = [profileResult.error, propertiesResult.error, hostReviewResult.error, guestReviewResult.error].find(Boolean);
    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const propertyIds = (propertiesResult.data ?? []).map((property) => property.id);
    const bookingResult = propertyIds.length
      ? await supabase
          .from('bookings')
          .select('id, property_id, start_at, end_at, status, properties(name, city, state)')
          .eq('guest_id', guestId)
          .in('property_id', propertyIds)
          .order('start_at', { ascending: false })
      : { data: [] as GuestBooking[], error: null };

    if (bookingResult.error) {
      setErrorMessage(bookingResult.error.message);
      setIsLoading(false);
      return;
    }

    const bookingRows = (bookingResult.data ?? []).map((booking) => ({
      ...booking,
      properties: Array.isArray(booking.properties) ? booking.properties[0] ?? null : booking.properties,
    })) as GuestBooking[];

    setDisplayName(profileResult.data?.display_name ?? initialGuestName);
    setBookings(bookingRows);
    setHostReviews((hostReviewResult.data ?? []) as BookingReview[]);
    setGuestReviews((guestReviewResult.data ?? []) as BookingReview[]);
    setIsLoading(false);
  }, [guestId, initialGuestName, session?.user.id]);

  useEffect(() => {
    void loadGuestPage();
  }, [loadGuestPage]);

  const latestBooking = bookings[0] ?? null;
  const latestCompletedBooking = bookings.find((booking) => booking.status === 'confirmed' && new Date(booking.end_at).getTime() <= Date.now()) ?? null;
  const averageHostRating = useMemo(() => formatAverage(hostReviews), [hostReviews]);
  const averageGuestRating = useMemo(() => formatAverage(guestReviews), [guestReviews]);

  const refresh = async () => {
    setIsRefreshing(true);
    await loadGuestPage();
    setIsRefreshing(false);
  };

  const myReviewedBookingIds = new Set(hostReviews.filter((review) => review.reviewer_id === session?.user.id).map((review) => review.booking_id));

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ModeLabel mode="Host" page={10} />
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.forest} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ModeLabel mode="Host" page={10} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.forest} />}
        showsVerticalScrollIndicator={false}
      >
        <Pressable accessibilityRole="button" onPress={() => router.replace('/host-reviews')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Back to Host Reviews</Text>
        </Pressable>

        <Text style={styles.eyebrow}>GUEST PROFILE</Text>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.description}>
          Host-only guest record. You can see your reservations with this guest and factual host feedback after completed visits.
        </Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryLabel}>Your visits</Text>
              <Text style={styles.summaryValue}>{bookings.length}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryLabel}>Your reviews</Text>
              <Text style={styles.summaryValue}>{myReviewedBookingIds.size}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryLabel}>Avg host score</Text>
              <Text style={styles.summaryValue}>{averageHostRating === 'N/A' ? averageHostRating : `★ ${averageHostRating}`}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryLabel}>Avg guest score</Text>
              <Text style={styles.summaryValue}>{averageGuestRating === 'N/A' ? averageGuestRating : `★ ${averageGuestRating}`}</Text>
            </View>
          </View>
          <View style={styles.summaryFooter}>
            <Text style={styles.summaryFooterLabel}>Latest reservation</Text>
            <Text style={styles.summaryFooterValue}>
              {latestBooking ? latestBooking.properties?.name ?? 'Property details unavailable' : 'No reservations found'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your reservations with this guest</Text>
          <Text style={styles.sectionDescription}>
            This page stays available after the visit so you can review the guest later.
          </Text>
          {bookings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No reservations yet</Text>
              <Text style={styles.emptyText}>When this guest books one of your properties, the reservation will appear here.</Text>
            </View>
          ) : (
            bookings.map((booking) => {
              const hasReview = hostReviews.some((review) => review.booking_id === booking.id && review.reviewer_id === session?.user.id);
              const propertyLabel = booking.properties
                ? `${booking.properties.name} - ${booking.properties.city}, ${booking.properties.state}`
                : 'Property details unavailable';

              return (
                <View key={booking.id} style={styles.bookingCard}>
                  <View style={styles.bookingHeader}>
                    <View style={styles.bookingCopy}>
                      <Text style={styles.bookingTitle}>{propertyLabel}</Text>
                      <Text style={styles.bookingText}>{formatVisitRange(booking.start_at, booking.end_at)}</Text>
                    </View>
                    <View style={[styles.statusBadge, booking.status === 'cancelled' ? styles.cancelledBadge : styles.confirmedBadge]}>
                      <Text style={[styles.statusText, booking.status === 'cancelled' ? styles.cancelledText : styles.confirmedText]}>
                        {booking.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.bookingActions}>
                    {!hasReview && booking.status === 'confirmed' && new Date(booking.end_at).getTime() <= Date.now() ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push(`/review?bookingId=${booking.id}&direction=host_to_guest` as never)}
                        style={styles.reviewButton}
                      >
                        <Text style={styles.reviewButtonText}>Review Guest</Text>
                      </Pressable>
                    ) : null}
                    {hasReview ? <Text style={styles.reviewedText}>Reviewed by you</Text> : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews about this guest</Text>
          <Text style={styles.sectionDescription}>
            Feedback from hosts after completed visits.
          </Text>
          {hostReviews.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No host reviews yet</Text>
              <Text style={styles.emptyText}>When hosts review this guest, the reviews will appear here.</Text>
            </View>
          ) : (
            hostReviews.map((review) => {
              const booking = bookings.find((item) => item.id === review.booking_id);
              const propertyLabel = booking?.properties
                ? `${booking.properties.name} - ${booking.properties.city}, ${booking.properties.state}`
                : 'Property details unavailable';

              return (
                <ReviewCard
                  key={review.id}
                  review={review}
                  title="Host review"
                  propertyLabel={propertyLabel === 'Property details unavailable' ? 'Host-only feedback' : propertyLabel}
                  hostOnly
                />
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews written by this guest</Text>
          <Text style={styles.sectionDescription}>
            Public site reviews this guest has shared.
          </Text>
          {guestReviews.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No guest reviews yet</Text>
              <Text style={styles.emptyText}>When this guest reviews a site, the review will appear here.</Text>
            </View>
          ) : (
            guestReviews.map((review) => {
              const booking = bookings.find((item) => item.id === review.booking_id);
              const propertyLabel = booking?.properties
                ? `${booking.properties.name} - ${booking.properties.city}, ${booking.properties.state}`
                : 'Property details unavailable';

              return (
                <ReviewCard
                  key={review.id}
                  review={review}
                  title="Guest review"
                  propertyLabel={propertyLabel}
                />
              );
            })
          )}
        </View>

        {latestCompletedBooking ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/review?bookingId=${latestCompletedBooking.id}&direction=host_to_guest` as never)}
            style={styles.floatingReviewButton}
          >
            <Text style={styles.floatingReviewButtonText}>Review Most Recent Guest Visit</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  loadingState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 10 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  errorText: { color: '#8A3C35', fontSize: 14, lineHeight: 20, marginTop: 18 },
  summaryCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 16, ...shadows.card },
  summaryRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  summaryMetric: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 },
  summaryLabel: { color: colors.brown, fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  summaryValue: { color: colors.forest, fontSize: 24, fontWeight: '900', marginTop: 6 },
  summaryFooter: { marginTop: 14 },
  summaryFooterLabel: { color: colors.brown, fontSize: 12, fontWeight: '800' },
  summaryFooterValue: { color: colors.forest, fontSize: 14, fontWeight: '700', marginTop: 4 },
  section: { marginTop: 26 },
  sectionTitle: { color: colors.forest, fontSize: 20, fontWeight: '900' },
  sectionDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 18, ...shadows.card },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  bookingCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16, ...shadows.card },
  bookingHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  bookingCopy: { flex: 1, paddingRight: 12 },
  bookingTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  bookingText: { color: colors.muted, fontSize: 13, marginTop: 4 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  confirmedBadge: { backgroundColor: colors.lightGreen },
  cancelledBadge: { backgroundColor: '#F5E7E2' },
  statusText: { fontSize: 12, fontWeight: '900' },
  confirmedText: { color: colors.forest },
  cancelledText: { color: '#8A3C35' },
  bookingActions: { alignItems: 'flex-start', marginTop: 12 },
  reviewButton: { backgroundColor: colors.forest, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  reviewButtonText: { color: colors.cream, fontSize: 12, fontWeight: '900' },
  reviewedText: { color: colors.brown, fontSize: 12, fontWeight: '800' },
  reviewCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16, ...shadows.card },
  reviewHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  reviewHeading: { flex: 1, paddingRight: 12 },
  reviewTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  reviewMeta: { color: colors.brown, fontSize: 13, fontWeight: '700', marginTop: 4 },
  ratingBadge: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  ratingText: { color: colors.forest, fontSize: 13, fontWeight: '900' },
  reviewDate: { color: colors.muted, fontSize: 12, marginTop: 8 },
  reviewText: { color: colors.forest, fontSize: 15, lineHeight: 22, marginTop: 10 },
  reviewTextMuted: { color: colors.muted, fontSize: 14, fontStyle: 'italic', lineHeight: 21, marginTop: 10 },
  detailRow: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, gap: 12 },
  detailLabel: { color: colors.brown, flex: 1, fontSize: 12, fontWeight: '800' },
  detailValue: { color: colors.forest, flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  notesBlock: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  notesText: { color: colors.forest, fontSize: 14, lineHeight: 20, marginTop: 6 },
  floatingReviewButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, marginTop: 18, minHeight: 52, justifyContent: 'center' },
  floatingReviewButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
});
