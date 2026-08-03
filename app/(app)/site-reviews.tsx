import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { HostPageGuide } from '../../components/host-page-guide';
import { getPendingSiteReviews, type PendingSiteReview } from '../../lib/site-reviews';
import { useAuth } from '../../services/auth-context';

function formatCompletedDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SiteReviewsScreen() {
  const { session } = useAuth();
  const [reviews, setReviews] = useState<PendingSiteReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!session?.user.id) return;
    setErrorMessage(null);

    try {
      setReviews(await getPendingSiteReviews(session.user.id));
    } catch {
      setErrorMessage('We could not load your completed visits. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/dashboard')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Member Dashboard</Text>
        </Pressable>
        <Text style={styles.title}>Site Reviews</Text>
        <Text style={styles.description}>Share feedback about completed visits. Your review helps other dog families choose a private space.</Text>

        {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : null}
        {errorMessage ? <View style={styles.errorCard}><Text style={styles.errorText}>{errorMessage}</Text><Pressable accessibilityRole="button" onPress={() => { setIsLoading(true); void loadReviews(); }} style={styles.tryAgainButton}><Text style={styles.tryAgainText}>Try again</Text></Pressable></View> : null}
        {!isLoading && !errorMessage && reviews.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>You are all caught up</Text><Text style={styles.emptyText}>Completed visits that still need a review will appear here.</Text></View> : null}
        {!isLoading && !errorMessage ? reviews.map((review) => <View key={review.bookingId} style={styles.reviewCard}>
          <Text style={styles.siteName}>{review.siteName}</Text>
          <Text style={styles.date}>Completed {formatCompletedDate(review.completedAt)}</Text>
          <Pressable accessibilityLabel={`Review ${review.siteName}`} accessibilityRole="button" onPress={() => router.push(`/review?bookingId=${review.bookingId}&direction=guest_to_host` as never)} style={styles.reviewButton}>
            <Text style={styles.reviewButtonText}>Review visit</Text>
          </Pressable>
        </View>) : null}
        <HostPageGuide
          title="How to use Site Reviews"
          intro="Reviews are available after a completed visit and help other dog families choose with confidence."
          tone="forest"
          steps={[
            { title: 'Wait for the visit to end', text: 'A completed visit appears here when it is ready for your feedback.' },
            { title: 'Share your experience', text: 'Open Review visit and describe the private space honestly and respectfully.' },
            { title: 'Keep it useful', text: 'Helpful details include the space, arrival experience, amenities, and anything future guests should know.' },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  title: memberUi.pageTitle,
  description: memberUi.pageDescription,
  loading: { alignItems: 'center', paddingVertical: 38 },
  emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 18 },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  errorCard: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 16, borderWidth: 1, marginTop: 20, padding: 16 },
  errorText: { color: colors.red, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  tryAgainButton: { alignSelf: 'flex-start', borderColor: colors.red, borderRadius: 10, borderWidth: 1, marginTop: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  tryAgainText: { color: colors.red, fontSize: 13, fontWeight: '900' },
  reviewCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 5, padding: 16 },
  siteName: memberUi.cardTitle,
  date: { color: colors.muted, fontSize: 14, marginTop: 6 },
  reviewButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 16, minHeight: 46 },
  reviewButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
});
