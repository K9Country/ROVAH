import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { BookingReview } from '../../types/review';

type HostFeedback = BookingReview & { properties: { name: string; city: string; state: string } | null };

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function HostFeedbackScreen() {
  const { session } = useAuth();
  const [feedback, setFeedback] = useState<HostFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    if (!session?.user.id) return;
    setErrorMessage(null);
    const { data, error } = await supabase
      .from('booking_reviews')
      .select('*, properties(name, city, state)')
      .eq('reviewee_id', session.user.id)
      .eq('review_type', 'host_to_guest')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMessage('We could not load your host feedback. Please try again.');
    } else {
      setFeedback((data ?? []).map((review) => ({ ...review, properties: Array.isArray(review.properties) ? review.properties[0] ?? null : review.properties })) as HostFeedback[]);
      await supabase.rpc('mark_host_feedback_read');
    }
    setIsLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>{'<'} Dashboard</Text></Pressable>
        <Text style={[styles.title, memberUi.pageTitle]}>Host Feedback</Text>
        <Text style={[styles.description, memberUi.pageDescription]}>Private feedback from the hosts you have visited. It is not visible to other members or hosts.</Text>
        {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : null}
        {errorMessage ? <View style={styles.errorCard}><Text style={styles.errorText}>{errorMessage}</Text><Pressable accessibilityRole="button" onPress={() => { setIsLoading(true); void loadFeedback(); }} style={styles.tryAgainButton}><Text style={styles.tryAgainText}>Try again</Text></Pressable></View> : null}
        {!isLoading && !errorMessage && feedback.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No host feedback yet</Text><Text style={styles.emptyText}>When a host shares private feedback after a completed visit, it will appear here.</Text></View> : null}
        {!isLoading && !errorMessage ? feedback.map((review) => <View key={review.id} style={styles.feedbackCard}><View style={styles.cardHeader}><View style={styles.cardCopy}><Text style={styles.siteName}>{review.properties?.name ?? 'Private space'}</Text><Text style={styles.siteLocation}>{review.properties ? `${review.properties.city}, ${review.properties.state}` : 'Completed visit'}</Text></View><View style={styles.ratingBadge}><Text style={styles.ratingText}>★ {review.bone_rating}/5</Text></View></View><Text selectable style={styles.date}>{formatDate(review.created_at)}</Text><Text selectable style={review.review_text ? styles.feedbackText : styles.mutedText}>{review.review_text || 'Your host did not add a written note.'}</Text></View>) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  loading: { alignItems: 'center', paddingVertical: 38 },
  errorCard: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 16, borderWidth: 1, marginTop: 20, padding: 16 },
  errorText: { color: colors.red, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  tryAgainButton: { alignSelf: 'flex-start', borderColor: colors.red, borderRadius: 10, borderWidth: 1, marginTop: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  tryAgainText: { color: colors.red, fontSize: 13, fontWeight: '900' },
  emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 18 },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  feedbackCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 5, padding: 16 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardCopy: { flex: 1, paddingRight: 12 },
  siteName: memberUi.cardTitle,
  siteLocation: memberUi.cardDescription,
  ratingBadge: { backgroundColor: colors.lightGreen, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  ratingText: { color: colors.forest, fontSize: 13, fontWeight: '900' },
  date: { color: colors.brown, fontSize: 12, fontWeight: '800', marginTop: 14 },
  feedbackText: { color: colors.forest, fontSize: 15, lineHeight: 22, marginTop: 8 },
  mutedText: { color: colors.muted, fontSize: 14, fontStyle: 'italic', lineHeight: 21, marginTop: 8 },
});
