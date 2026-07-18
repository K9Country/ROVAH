import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import type { BookingReview } from '../../../types/review';

type HostSite = {
  id: string;
  name: string;
  city: string;
  state: string;
  short_description: string;
  price_per_hour: number;
};

export default function HostPublicProfileScreen() {
  const { hostId } = useLocalSearchParams<{ hostId?: string }>();
  const [hostName, setHostName] = useState('Host');
  const [profileImageUrl, setProfileImageUrl] = useState<string | undefined>();
  const [sites, setSites] = useState<HostSite[]>([]);
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!hostId) {
      setErrorMessage('This host profile could not be found.');
      setIsLoading(false);
      return;
    }
    setErrorMessage(null);
    const [profileResult, sitesResult, avatarResult] = await Promise.all([
      supabase.from('messaging_profiles').select('display_name').eq('user_id', hostId).maybeSingle(),
      supabase.from('properties').select('id, name, city, state, short_description, price_per_hour').eq('host_id', hostId).eq('is_published', true).order('name'),
      supabase.rpc('get_conversation_profile_images', { target_user_ids: [hostId] }),
    ]);
    const firstError = [profileResult.error, sitesResult.error, avatarResult.error].find(Boolean);
    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }
    const hostSites = (sitesResult.data ?? []) as HostSite[];
    const siteIds = hostSites.map((site) => site.id);
    const { data: reviewRows, error: reviewsError } = siteIds.length
      ? await supabase.from('booking_reviews').select('*').eq('review_type', 'guest_to_host').eq('comment_visibility', 'public').in('property_id', siteIds).order('created_at', { ascending: false })
      : { data: [], error: null };
    if (reviewsError) {
      setErrorMessage(reviewsError.message);
      setIsLoading(false);
      return;
    }
    const avatar = ((avatarResult.data ?? []) as { bucket_id: string; profile_image_path: string; user_id: string }[])[0];
    setHostName(profileResult.data?.display_name ?? 'K9 Country host');
    setProfileImageUrl(avatar ? supabase.storage.from(avatar.bucket_id).getPublicUrl(avatar.profile_image_path).data.publicUrl : undefined);
    setSites(hostSites);
    setReviews((reviewRows ?? []) as BookingReview[]);
    setIsLoading(false);
  }, [hostId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const reviewsBySite = useMemo(() => new Map(sites.map((site) => [site.id, reviews.filter((review) => review.property_id === site.id)])), [reviews, sites]);
  const overallRating = reviews.length ? (reviews.reduce((total, review) => total + review.bone_rating, 0) / reviews.length).toFixed(1) : null;

  const refresh = async () => {
    setIsRefreshing(true);
    await loadProfile();
    setIsRefreshing(false);
  };

  if (isLoading) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} size="large" /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.forest} />} showsVerticalScrollIndicator={false}>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        <View style={styles.hero}>
          <Pressable accessibilityLabel={profileImageUrl ? `View ${hostName}'s profile photo` : `${hostName} has not added a profile photo`} accessibilityRole="button" disabled={!profileImageUrl} onPress={() => setIsPhotoExpanded(true)} style={[styles.avatarFrame, !profileImageUrl && styles.avatarUnavailable]}>
            <Image accessibilityLabel={`${hostName}'s profile photo`} contentFit="cover" source={profileImageUrl ? { uri: profileImageUrl } : require('../../../assets/images/k9-11.png')} style={styles.avatar} />
          </Pressable>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{hostName}</Text>
            <Text style={styles.subtitle}>{sites.length} {sites.length === 1 ? 'private site' : 'private sites'} available to guests</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>ALL SITES GUEST RATING</Text>
          <Text style={styles.summaryValue}>{overallRating ? `★ ${overallRating} / 5` : 'New host'}</Text>
          <Text style={styles.summaryText}>{reviews.length} {reviews.length === 1 ? 'guest review' : 'guest reviews'} across their sites</Text>
        </View>

        <Text style={styles.sectionTitle}>Sites hosted by {hostName}</Text>
        {sites.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No public sites yet</Text><Text style={styles.emptyText}>This host does not have any sites available for booking right now.</Text></View> : sites.map((site) => {
          const siteReviews = reviewsBySite.get(site.id) ?? [];
          const siteRating = siteReviews.length ? (siteReviews.reduce((total, review) => total + review.bone_rating, 0) / siteReviews.length).toFixed(1) : null;
          return <Pressable accessibilityRole="button" key={site.id} onPress={() => router.push(`/property/${site.id}` as never)} style={styles.siteCard}>
            <View style={styles.siteCopy}>
              <Text style={styles.siteName}>{site.name}</Text>
              <Text style={styles.siteLocation}>{site.city}, {site.state}</Text>
              <Text numberOfLines={2} style={styles.siteDescription}>{site.short_description}</Text>
              <Text style={styles.price}>${Number(site.price_per_hour).toFixed(0)} / hour</Text>
            </View>
            <View style={styles.siteRating}><Text style={styles.siteRatingValue}>{siteRating ? `★ ${siteRating}` : '—'}</Text><Text style={styles.siteRatingLabel}>{siteReviews.length} reviews</Text></View>
          </Pressable>;
        })}

        {reviews.length > 0 ? <>
          <Text style={styles.sectionTitle}>Recent guest feedback</Text>
          {reviews.slice(0, 3).map((review) => <View key={review.id} style={styles.reviewCard}><View style={styles.reviewHeader}><Text style={styles.reviewTitle}>Guest site review</Text><Text style={styles.reviewRating}>★ {review.bone_rating}/5</Text></View><Text style={styles.reviewAnswer}>Clean and maintained: {formatAnswer(review.cleanliness)}</Text>{review.property_matches_listing ? <Text style={styles.reviewAnswer}>Matched listing and photos: {formatAnswer(review.property_matches_listing)}</Text> : null}<Text style={styles.reviewAnswer}>Safe and secure: {formatAnswer(review.fence_security)}</Text>{review.would_book_again ? <Text style={styles.reviewAnswer}>Would book again: {formatAnswer(review.would_book_again)}</Text> : null}<Text style={styles.reviewText}>{review.review_text || 'No additional comments shared.'}</Text></View>)}
        </> : null}
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => setIsPhotoExpanded(false)} transparent visible={isPhotoExpanded}>
        <View style={styles.photoModalBackdrop}>
          <Pressable accessibilityLabel="Close profile photo" accessibilityRole="button" onPress={() => setIsPhotoExpanded(false)} style={styles.photoModalCloseArea}>
            <Pressable onPress={() => undefined} style={styles.photoModal}>
              <Image accessibilityLabel={`${hostName}'s profile photo`} contentFit="contain" source={profileImageUrl ? { uri: profileImageUrl } : require('../../../assets/images/k9-11.png')} style={styles.expandedPhoto} />
              <Text style={styles.photoModalName}>{hostName}</Text>
              <Text style={styles.photoModalHint}>Tap outside this photo to close</Text>
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatAnswer(value: 'yes' | 'no' | 'not_sure' | null) {
  return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not answered';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', marginBottom: 12, minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  errorText: { color: colors.danger, fontSize: 14, marginTop: 18 },
  hero: { alignItems: 'center', flexDirection: 'row', marginTop: 16 },
  avatarFrame: { backgroundColor: colors.lightGreen, borderColor: colors.brown, borderRadius: 42, borderWidth: 2, height: 84, overflow: 'hidden', width: 84 },
  avatarUnavailable: { opacity: 0.7 },
  avatar: { height: '100%', width: '100%' },
  heroCopy: { flex: 1, marginLeft: 15 },
  eyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.forest, fontSize: 28, fontWeight: '900', marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  summaryCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 17 },
  summaryLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  summaryValue: { color: colors.forest, fontSize: 26, fontWeight: '900', marginTop: 5 },
  summaryText: { color: colors.muted, fontSize: 13, marginTop: 4 },
  sectionTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginTop: 28, marginBottom: 2 },
  siteCard: { alignItems: 'flex-start', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginTop: 12, padding: 16 },
  siteCopy: { flex: 1, paddingRight: 12 },
  siteName: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  siteLocation: { color: colors.muted, fontSize: 13, marginTop: 4 },
  siteDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 9 },
  price: { color: colors.brown, fontSize: 14, fontWeight: '900', marginTop: 11 },
  siteRating: { alignItems: 'flex-end' },
  siteRatingValue: { color: colors.forest, fontSize: 21, fontWeight: '900' },
  siteRatingLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 18 },
  emptyTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  reviewCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 15 },
  reviewHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  reviewTitle: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  reviewRating: { color: colors.brown, fontSize: 13, fontWeight: '900' },
  reviewText: { color: colors.forest, fontSize: 14, lineHeight: 21, marginTop: 9 },
  reviewAnswer: { color: colors.forest, fontSize: 13, fontWeight: '700', marginTop: 7 },
  photoModalBackdrop: { backgroundColor: 'rgba(12, 24, 15, 0.82)', flex: 1, justifyContent: 'center', padding: 20 },
  photoModalCloseArea: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  photoModal: { alignItems: 'center', maxHeight: '90%', maxWidth: 520, width: '100%' },
  expandedPhoto: { backgroundColor: colors.forest, borderRadius: 18, height: 420, maxHeight: '78%', width: '100%' },
  photoModalName: { color: colors.warmWhite, fontSize: 20, fontWeight: '900', marginTop: 16 },
  photoModalHint: { color: colors.warmWhite, fontSize: 14, marginTop: 6, opacity: 0.82 },
});
