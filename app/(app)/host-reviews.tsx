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

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { BookingReview } from '../../types/review';

type HostProperty = {
  id: string;
  name: string;
  city: string;
  state: string;
};

type GuestVisit = {
  id: string;
  guest_id: string;
  property_id: string;
  end_at: string;
  properties: { name: string } | null;
};

type ReviewTrack = 'site_feedback' | 'guest_records';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAnswer(value: BookingReview['fence_security']) {
  return value === 'not_sure' ? 'Not sure' : value === 'yes' ? 'Yes' : 'No';
}

export default function HostReviewsScreen() {
  const { propertyId, propertyName, view } = useLocalSearchParams<{
    propertyId?: string;
    propertyName?: string;
    view?: ReviewTrack;
  }>();
  const { session } = useAuth();
  const [properties, setProperties] = useState<HostProperty[]>([]);
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [guestVisits, setGuestVisits] = useState<GuestVisit[]>([]);
  const [hostReviews, setHostReviews] = useState<BookingReview[]>([]);
  const [guestNames, setGuestNames] = useState<Record<string, string>>({});
  const [activeTrack, setActiveTrack] = useState<ReviewTrack>(
    view === 'guest_records' ? 'guest_records' : 'site_feedback'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSiteFeedback = useCallback(async () => {
    if (!session?.user.id) {
      setProperties([]);
      setReviews([]);
      setGuestVisits([]);
      setHostReviews([]);
      setGuestNames({});
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    const { data: propertyRows, error: propertiesError } = await supabase
      .from('properties')
      .select('id, name, city, state')
      .eq('host_id', session.user.id)
      .order('name');

    if (propertiesError) {
      setErrorMessage(propertiesError.message);
      setIsLoading(false);
      return;
    }

    const ownedProperties = (propertyRows ?? []) as HostProperty[];
    const ownedPropertyIds = propertyId
      ? ownedProperties.filter((property) => property.id === propertyId).map((property) => property.id)
      : ownedProperties.map((property) => property.id);

    const siteReviewsRequest = ownedPropertyIds.length
      ? supabase
          .from('booking_reviews')
          .select('*')
          .eq('review_type', 'guest_to_host')
          .eq('comment_visibility', 'public')
          .in('property_id', ownedPropertyIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null });
    const visitsRequest = ownedPropertyIds.length
      ? supabase
          .from('bookings')
          .select('id, guest_id, property_id, end_at, properties(name)')
          .eq('status', 'confirmed')
          .lte('end_at', new Date().toISOString())
          .in('property_id', ownedPropertyIds)
          .order('end_at', { ascending: false })
      : Promise.resolve({ data: [], error: null });
    const hostReviewsRequest = ownedPropertyIds.length
      ? supabase
          .from('booking_reviews')
          .select('*')
          .eq('reviewer_id', session.user.id)
          .eq('review_type', 'host_to_guest')
          .in('property_id', ownedPropertyIds)
      : Promise.resolve({ data: [], error: null });
    const [siteReviewsResult, visitsResult, hostReviewsResult] = await Promise.all([
      siteReviewsRequest,
      visitsRequest,
      hostReviewsRequest,
    ]);

    const firstError = [siteReviewsResult.error, visitsResult.error, hostReviewsResult.error].find(Boolean);
    if (firstError) setErrorMessage(firstError.message);

    const visits = (visitsResult.data ?? []).map((visit) => ({
      ...visit,
      properties: Array.isArray(visit.properties)
        ? visit.properties[0] ?? null
        : visit.properties,
    })) as GuestVisit[];
    const guestIds = [...new Set(visits.map((visit) => visit.guest_id))];
    if (guestIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('messaging_profiles')
        .select('user_id, display_name')
        .in('user_id', guestIds);
      if (profilesError) setErrorMessage(profilesError.message);
      setGuestNames(Object.fromEntries((profiles ?? []).map((profile) => [profile.user_id, profile.display_name])));
    } else {
      setGuestNames({});
    }
    setProperties(ownedProperties);
    setReviews((siteReviewsResult.data ?? []) as BookingReview[]);
    setGuestVisits(visits);
    setHostReviews((hostReviewsResult.data ?? []) as BookingReview[]);
    setIsLoading(false);
  }, [propertyId, session?.user.id]);

  useEffect(() => {
    void loadSiteFeedback();
  }, [loadSiteFeedback]);

  const propertyById = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  );
  const selectedProperty = propertyId ? propertyById.get(propertyId) : null;
  const selectedPropertyLabel = selectedProperty
    ? selectedProperty.name
    : propertyName
      ? decodeURIComponent(propertyName)
      : null;
  const averageRating = reviews.length
    ? (reviews.reduce((total, review) => total + review.bone_rating, 0) / reviews.length).toFixed(1)
    : null;
  const reviewedVisitIds = useMemo(
    () => new Set(hostReviews.map((review) => review.booking_id)),
    [hostReviews]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void loadSiteFeedback()}
            tintColor={colors.forest}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/host-dashboard')}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{'<'} Host Dashboard</Text>
        </Pressable>

        <Text style={styles.title}>
          {selectedPropertyLabel ? `${selectedPropertyLabel} reviews` : 'Site reviews'}
        </Text>
        <Text style={styles.description}>
          Each review belongs to the specific site a guest visited. Use the reviews to improve that site’s safety, cleanliness, and guest experience.
        </Text>
        <View style={styles.trackPicker}>
          <TrackButton label="Site reviews" selected={activeTrack === 'site_feedback'} onPress={() => setActiveTrack('site_feedback')} />
          <TrackButton label="Guest Reviews" selected={activeTrack === 'guest_records'} onPress={() => setActiveTrack('guest_records')} />
        </View>

        {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {!isLoading && selectedProperty && activeTrack === 'site_feedback' ? (
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>SITE RATING</Text>
              <Text style={styles.summaryValue}>{averageRating ? `★ ${averageRating} / 5` : 'No rating yet'}</Text>
              <Text style={styles.summaryText}>{reviews.length} {reviews.length === 1 ? 'guest review' : 'guest reviews'}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/property-draft/${selectedProperty.id}` as never)}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>Edit site</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !selectedProperty && activeTrack === 'site_feedback' ? (
          <View style={styles.siteList}>
            <Text style={styles.sectionTitle}>Your sites</Text>
            {properties.length === 0 ? (
              <EmptyCard title="No sites yet" text="Create a private space first. Reviews will stay attached to that individual site." />
            ) : properties.map((property) => {
              const propertyReviews = reviews.filter((review) => review.property_id === property.id);
              const propertyAverage = propertyReviews.length
                ? (propertyReviews.reduce((total, review) => total + review.bone_rating, 0) / propertyReviews.length).toFixed(1)
                : '—';
              return (
                <Pressable
                  accessibilityRole="button"
                  key={property.id}
                  onPress={() => router.push(`/host-reviews?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}` as never)}
                  style={styles.siteCard}
                >
                  <View style={styles.siteCardCopy}>
                    <Text style={styles.siteName}>{property.name}</Text>
                    <Text style={styles.siteLocation}>{property.city}, {property.state}</Text>
                  </View>
                  <View style={styles.siteRating}>
                    <Text style={styles.siteRatingValue}>{propertyAverage === '—' ? propertyAverage : `★ ${propertyAverage}`}</Text>
                    <Text style={styles.siteRatingLabel}>{propertyReviews.length} reviews</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!isLoading && selectedProperty && activeTrack === 'site_feedback' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Guest feedback</Text>
            {reviews.length === 0 ? (
              <EmptyCard title="No site reviews yet" text="After guests complete a visit, they can leave feedback about this specific site here." />
            ) : reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View>
                    <Text style={styles.reviewTitle}>Guest site review</Text>
                    <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
                  </View>
                  <View style={styles.ratingBadge}><Text style={styles.ratingText}>★ {review.bone_rating}/5</Text></View>
                </View>
                {review.review_text ? <Text style={styles.reviewText}>{review.review_text}</Text> : <Text style={styles.mutedText}>No written note shared.</Text>}
                <View style={styles.detailsGrid}>
                  <Detail label="Fence security" value={formatAnswer(review.fence_security)} />
                  <Detail label="Cleanliness" value={formatAnswer(review.cleanliness)} />
                </View>
                {review.nearby_distractions.length > 0 ? <Detail label="Nearby distractions" value={review.nearby_distractions.join(', ')} /> : null}
                {review.unexpected_encounters ? <Detail label="Unexpected encounters" value={review.unexpected_encounters} /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {!isLoading && activeTrack === 'guest_records' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Guest reviews</Text>
            <Text style={styles.sectionDescription}>
              Review each completed visit once, then view that guest’s host-only review history.
            </Text>
            {guestVisits.length === 0 ? (
              <EmptyCard title="No completed guest visits yet" text="Guest records will appear here after visits at your site are complete." />
            ) : guestVisits.map((visit) => {
              const hasReview = reviewedVisitIds.has(visit.id);
              const guestName = guestNames[visit.guest_id] ?? 'Guest';
              return (
                <View key={visit.id} style={styles.visitCard}>
                  <View style={styles.visitHeader}>
                    <View style={styles.visitCopy}>
                      <Text style={styles.visitGuestName}>{guestName}</Text>
                      <Text style={styles.visitMeta}>{visit.properties?.name ?? 'Private space'} · Completed {formatDate(visit.end_at)}</Text>
                    </View>
                    <View style={[styles.statusBadge, hasReview ? styles.statusReviewed : styles.statusPending]}>
                      <Text style={[styles.statusText, hasReview ? styles.statusReviewedText : styles.statusPendingText]}>{hasReview ? 'Reviewed' : 'Needs review'}</Text>
                    </View>
                  </View>
                  <View style={styles.visitActions}>
                    {!hasReview ? <Pressable accessibilityRole="button" onPress={() => router.push(`/review?bookingId=${visit.id}&direction=host_to_guest` as never)} style={styles.reviewGuestButton}><Text style={styles.reviewGuestButtonText}>Review guest</Text></Pressable> : null}
                    <Pressable accessibilityRole="button" onPress={() => router.push(`/host-guests/${visit.guest_id}?guestName=${encodeURIComponent(guestName)}` as never)} style={styles.recordButton}><Text style={styles.recordButtonText}>View track record</Text></Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrackButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.trackButton, selected && styles.trackButtonSelected]}><Text style={[styles.trackButtonText, selected && styles.trackButtonTextSelected]}>{label}</Text></Pressable>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  trackPicker: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 20, padding: 4 },
  trackButton: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 8 },
  trackButtonSelected: { backgroundColor: colors.forest },
  trackButtonText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  trackButtonTextSelected: { color: colors.warmWhite },
  loading: { alignItems: 'center', paddingVertical: 28 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, marginTop: 18 },
  summaryCard: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, padding: 17 },
  summaryLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  summaryValue: { color: colors.forest, fontSize: 25, fontWeight: '900', marginTop: 5 },
  summaryText: { color: colors.muted, fontSize: 13, marginTop: 3 },
  editButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 11, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  editButtonText: { color: colors.warmWhite, fontSize: 13, fontWeight: '900' },
  siteList: { marginTop: 28 },
  section: { marginTop: 28 },
  sectionTitle: { color: colors.forest, fontSize: 20, fontWeight: '900' },
  siteCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, padding: 16 },
  siteCardCopy: { flex: 1, paddingRight: 12 },
  siteName: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  siteLocation: { color: colors.muted, fontSize: 13, marginTop: 5 },
  siteRating: { alignItems: 'flex-end' },
  siteRatingValue: { color: colors.forest, fontSize: 21, fontWeight: '900' },
  siteRatingLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  sectionDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 18 },
  emptyTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  reviewCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 },
  reviewHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  reviewTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  reviewDate: { color: colors.muted, fontSize: 12, marginTop: 4 },
  ratingBadge: { backgroundColor: colors.lightGreen, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  ratingText: { color: colors.forest, fontSize: 13, fontWeight: '900' },
  reviewText: { color: colors.forest, fontSize: 15, lineHeight: 22, marginTop: 14 },
  mutedText: { color: colors.muted, fontSize: 14, fontStyle: 'italic', marginTop: 14 },
  detailsGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  detail: { borderTopColor: colors.border, borderTopWidth: 1, flex: 1, marginTop: 12, paddingTop: 10 },
  detailLabel: { color: colors.brown, fontSize: 12, fontWeight: '800' },
  detailValue: { color: colors.forest, fontSize: 14, lineHeight: 20, marginTop: 4 },
  visitCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 },
  visitHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  visitCopy: { flex: 1, paddingRight: 10 },
  visitGuestName: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  visitMeta: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusReviewed: { backgroundColor: colors.lightGreen },
  statusPending: { backgroundColor: '#FFF1E4' },
  statusText: { fontSize: 11, fontWeight: '900' },
  statusReviewedText: { color: colors.olive },
  statusPendingText: { color: colors.brown },
  visitActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  reviewGuestButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 10, justifyContent: 'center', minHeight: 42, paddingHorizontal: 13 },
  reviewGuestButtonText: { color: colors.warmWhite, fontSize: 13, fontWeight: '900' },
  recordButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 13 },
  recordButtonText: { color: colors.forest, fontSize: 13, fontWeight: '900' },
});
