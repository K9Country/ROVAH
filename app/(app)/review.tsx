import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { BookingReview, ReviewDirection } from '../../types/review';

type ReviewBooking = {
  id: string;
  property_id: string;
  guest_id: string;
  status: 'confirmed' | 'cancelled';
  end_at: string;
  properties: { host_id: string; name: string; city: string; state: string } | null;
};
type Answer = 'yes' | 'no' | 'not_sure';
type BinaryAnswer = 'yes' | 'no';

function getSaveErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  if (message.toLowerCase().includes('row-level security') || message.toLowerCase().includes('permission denied')) {
    return 'Reviews can be shared after the reservation has ended.';
  }

  return message || 'We could not save your review. Please try again.';
}

export default function ReviewScreen() {
  const { bookingId, direction } = useLocalSearchParams<{ bookingId: string; direction: ReviewDirection }>();
  const { isHost, session } = useAuth();
  const [booking, setBooking] = useState<ReviewBooking | null>(null);
  const [existingReview, setExistingReview] = useState<BookingReview | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [fenceSecurity, setFenceSecurity] = useState<BinaryAnswer | null>(null);
  const [cleanliness, setCleanliness] = useState<BinaryAnswer | null>(null);
  const [matchesListing, setMatchesListing] = useState<BinaryAnswer | null>(null);
  const [wouldBookAgain, setWouldBookAgain] = useState<BinaryAnswer | null>(null);
  const [guestCommunication, setGuestCommunication] = useState<Answer>('not_sure');
  const [houseRulesFollowed, setHouseRulesFollowed] = useState<Answer>('not_sure');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReviewSaved, setIsReviewSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isHostReview = direction === 'host_to_guest';

  useEffect(() => {
    const loadReview = async () => {
      if (!bookingId || !session?.user.id) {
        setIsLoading(false);
        return;
      }
      const [bookingResult, reviewResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, property_id, guest_id, status, end_at, properties(host_id, name, city, state)')
          .eq('id', bookingId)
          .maybeSingle(),
        supabase
          .from('booking_reviews')
          .select('*')
          .eq('booking_id', bookingId)
          .eq('reviewer_id', session.user.id)
          .maybeSingle(),
      ]);
      if (bookingResult.error) Alert.alert('Unable to load review', bookingResult.error.message);
      const loadedBooking = bookingResult.data as ReviewBooking | null;
      const isAuthorizedForRequestedReview = Boolean(
        loadedBooking?.properties && (
          isHostReview
            ? isHost && loadedBooking.properties.host_id === session.user.id
            : !isHost && loadedBooking.guest_id === session.user.id
        )
      );
      if (!isAuthorizedForRequestedReview) {
        router.replace(isHost ? '/host-dashboard' : '/reservations');
        setIsLoading(false);
        return;
      }
      setBooking(loadedBooking);
      setExistingReview(reviewResult.data as BookingReview | null);
      setIsLoading(false);
    };
    void loadReview();
  }, [bookingId, isHost, isHostReview, session?.user.id]);

  const submitReview = async () => {
    setSaveError(null);
    if (!booking || !session?.user.id || !booking.properties) {
      setSaveError('We could not prepare this review. Return to Reservations and open the completed visit again.');
      return;
    }
    if (rating === 0) {
      setSaveError('Choose one to five stars before sharing your review.');
      return;
    }
    if (!isHostReview && (!cleanliness || !matchesListing || !fenceSecurity || !wouldBookAgain)) {
      setSaveError('Please choose Yes or No for each site review question before sharing.');
      return;
    }
    try {
      setIsSaving(true);
      const { error } = await supabase.from('booking_reviews').insert({
        booking_id: booking.id,
        property_id: booking.property_id,
        reviewer_id: session.user.id,
        reviewee_id: isHostReview ? booking.guest_id : booking.properties.host_id,
        review_type: direction,
        bone_rating: rating,
        review_text: reviewText.trim(),
        comment_visibility: 'public',
        fence_security: isHostReview ? guestCommunication : fenceSecurity,
        cleanliness: isHostReview ? houseRulesFollowed : cleanliness,
        property_matches_listing: isHostReview ? null : matchesListing,
        would_book_again: isHostReview ? null : wouldBookAgain,
        nearby_distractions: [],
        unexpected_encounters: '',
        photo_urls: [],
      });
      if (error) throw error;
      if (isHostReview) {
        router.replace('/host-dashboard');
        return;
      }
      setIsReviewSaved(true);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        setSaveError('You have already shared feedback for this visit.');
      } else {
        setSaveError(getSaveErrorMessage(error));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} /></View></SafeAreaView>;
  if (!booking?.properties) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.emptyText}>This completed visit is unavailable for review.</Text></View></SafeAreaView>;
  if (existingReview) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.title}>Review submitted</Text><Text style={styles.doneText}>You have already shared feedback for this visit.</Text><Pressable onPress={() => router.replace(isHostReview ? '/host-dashboard' : '/dashboard')} style={styles.exitButton}><Text style={styles.exitText}>{isHostReview ? 'Host Dashboard' : 'Member Dashboard'}</Text></Pressable></View></SafeAreaView>;
  if (booking.status !== 'confirmed' || new Date(booking.end_at).getTime() > Date.now()) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.title}>Review available after your visit</Text><Text style={styles.doneText}>You can share a review once this reservation has ended.</Text><Pressable onPress={() => router.replace(isHostReview ? '/host-dashboard' : '/reservations')} style={styles.exitButton}><Text style={styles.exitText}>{isHostReview ? 'Host Dashboard' : 'My Reservations'}</Text></Pressable></View></SafeAreaView>;

  const title = isHostReview ? 'How was this guest visit?' : `How was ${booking.properties.name}?`;
  const description = isHostReview
    ? 'Rate the visit and share useful feedback about communication and care for the space.'
    : 'Your public site review helps other dog families find a safe, comfortable place to visit.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {isHostReview ? <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backButtonText}>← Host Dashboard</Text></Pressable> : null}
        <Text style={styles.eyebrow}>{isHostReview ? 'GUEST FEEDBACK' : 'SITE REVIEW'}</Text>
        <Text style={styles.title}>{title}</Text>
        {!isHostReview ? <Text style={styles.siteLocation}>{booking.properties.city}, {booking.properties.state}</Text> : null}
        <Text style={styles.description}>{description}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Overall rating</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => <Pressable accessibilityLabel={`${star} of 5 stars`} accessibilityRole="button" key={star} onPress={() => setRating(star)} style={[styles.starButton, star <= rating && styles.starButtonActive]}><Text style={[styles.starText, star <= rating && styles.starTextActive]}>{star <= rating ? '★' : '☆'}</Text></Pressable>)}
          </View>
          <Text style={styles.ratingText}>{rating === 0 ? 'Choose a rating' : `${rating} of 5 stars`}</Text>

          {isHostReview ? (
            <>
              <Text style={styles.label}>Was communication clear and timely?</Text>
              <AnswerPicker value={guestCommunication} onChange={setGuestCommunication} />
              <Text style={styles.label}>Did they follow your site rules?</Text>
              <AnswerPicker value={houseRulesFollowed} onChange={setHouseRulesFollowed} />
            </>
          ) : (
            <>
              <Text style={styles.label}>Was the property clean and well maintained?</Text>
              <YesNoPicker value={cleanliness} onChange={setCleanliness} />
              <Text style={styles.label}>Did the property match the listing and photos?</Text>
              <YesNoPicker value={matchesListing} onChange={setMatchesListing} />
              <Text style={styles.label}>Did you feel the yard was safe and secure for your dog?</Text>
              <YesNoPicker value={fenceSecurity} onChange={setFenceSecurity} />
              <Text style={styles.label}>Would you book this location again?</Text>
              <YesNoPicker value={wouldBookAgain} onChange={setWouldBookAgain} />
            </>
          )}

          <Text style={styles.label}>{isHostReview ? 'Written feedback (optional)' : 'Additional Comments (Optional)'}</Text>
          <TextInput accessibilityLabel="Review write-up" maxLength={500} multiline onChangeText={setReviewText} placeholder={isHostReview ? 'What would help another host prepare for this guest?' : "Tell us anything else you'd like the host or K9 Country to know."} placeholderTextColor="#8A877D" style={styles.input} value={reviewText} />
          <Text style={styles.counter}>{reviewText.length}/500</Text>

          <Text style={styles.visibilityNote}>{isHostReview ? 'This review is shared with verified K9 Country members.' : 'This review is public to verified K9 Country members.'}</Text>
          {saveError ? <View accessibilityRole="alert" style={styles.saveError}><Text style={styles.saveErrorText}>{saveError}</Text></View> : null}
          <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void submitReview()} style={[styles.submitButton, isSaving && styles.disabled]}>{isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.submitText}>Share review</Text>}</Pressable>
        </View>
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => router.replace('/dashboard')} transparent visible={isReviewSaved}>
        <View style={styles.savedModalBackdrop}>
          <View accessibilityRole="alert" style={styles.savedModal}>
            <Text style={styles.savedModalTitle}>Review saved</Text>
            <Text style={styles.savedModalText}>Thank you for sharing feedback about this private space.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/dashboard')} style={styles.savedModalButton}>
              <Text style={styles.savedModalButtonText}>Return to Member Dashboard</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AnswerPicker({ value, onChange }: { value: Answer; onChange: (value: Answer) => void }) {
  return <View style={styles.choiceRow}>{(['yes', 'no', 'not_sure'] as const).map((option) => <Pressable accessibilityRole="button" key={option} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceSelected]}><Text style={[styles.choiceText, value === option && styles.choiceTextSelected]}>{option === 'not_sure' ? 'Not sure' : option === 'yes' ? 'Yes' : 'No'}</Text></Pressable>)}</View>;
}

function YesNoPicker({ value, onChange }: { value: BinaryAnswer | null; onChange: (value: BinaryAnswer) => void }) {
  return <View style={styles.choiceRow}>{(['yes', 'no'] as const).map((option) => <Pressable accessibilityRole="button" key={option} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceSelected]}><Text style={[styles.choiceText, value === option && styles.choiceTextSelected]}>{option === 'yes' ? 'Yes' : 'No'}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 44 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', marginBottom: 12, minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 8 },
  title: { color: colors.forest, fontSize: 29, fontWeight: '900', marginTop: 7 },
  siteLocation: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 6 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  card: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 18 },
  label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginBottom: 9, marginTop: 18 },
  stars: { flexDirection: 'row', gap: 8 },
  starButton: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  starButtonActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  starText: { color: colors.forest, fontSize: 22, fontWeight: '900' },
  starTextActive: { color: colors.warmWhite },
  ratingText: { color: colors.muted, fontSize: 13, marginTop: 8 },
  input: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, minHeight: 112, padding: 12, textAlignVertical: 'top' },
  counter: { color: colors.muted, fontSize: 12, marginTop: 5, textAlign: 'right' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  choiceSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  choiceText: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  choiceTextSelected: { color: colors.warmWhite },
  visibilityNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 20 },
  saveError: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 12, borderWidth: 1, marginTop: 14, padding: 12 },
  saveErrorText: { color: '#8C352C', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  submitButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 14, minHeight: 54 },
  submitText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  emptyText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  doneText: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: 'center' },
  exitButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 48, paddingHorizontal: 24 },
  exitText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  savedModalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(20, 38, 24, 0.52)', flex: 1, justifyContent: 'center', padding: 24 },
  savedModal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 420, padding: 24, width: '100%' },
  savedModalTitle: { color: colors.forest, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  savedModalText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  savedModalButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 50, paddingHorizontal: 14 },
  savedModalButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
});
