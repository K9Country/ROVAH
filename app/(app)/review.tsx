import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { BookingReview, ReviewDirection } from '../../types/review';

type ReviewBooking = {
  id: string;
  property_id: string;
  guest_id: string;
  properties: { host_id: string; name: string; city: string; state: string } | null;
};
type Answer = 'yes' | 'no' | 'not_sure';

export default function ReviewScreen() {
  const { bookingId, direction } = useLocalSearchParams<{ bookingId: string; direction: ReviewDirection }>();
  const { session } = useAuth();
  const [booking, setBooking] = useState<ReviewBooking | null>(null);
  const [existingReview, setExistingReview] = useState<BookingReview | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [fenceSecurity, setFenceSecurity] = useState<Answer>('not_sure');
  const [cleanliness, setCleanliness] = useState<Answer>('not_sure');
  const [nearbyDistractions, setNearbyDistractions] = useState('');
  const [unexpectedEncounters, setUnexpectedEncounters] = useState('');
  const [guestCommunication, setGuestCommunication] = useState<Answer>('not_sure');
  const [houseRulesFollowed, setHouseRulesFollowed] = useState<Answer>('not_sure');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
          .select('id, property_id, guest_id, properties(host_id, name, city, state)')
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
      setBooking(bookingResult.data as ReviewBooking | null);
      setExistingReview(reviewResult.data as BookingReview | null);
      setIsLoading(false);
    };
    void loadReview();
  }, [bookingId, session?.user.id]);

  const addPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.8,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      setPhotoUris((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 4));
    }
  };

  const uploadPhotos = async () => {
    if (!session?.user.id || !booking) return [];
    return Promise.all(photoUris.map(async (uri, index) => {
      const response = await fetch(uri);
      const path = `${session.user.id}/${booking.id}/${Date.now()}-${index}.jpg`;
      const { error } = await supabase.storage.from('review-photos').upload(path, await response.arrayBuffer(), { contentType: 'image/jpeg' });
      if (error) throw error;
      return supabase.storage.from('review-photos').getPublicUrl(path).data.publicUrl;
    }));
  };

  const submitReview = async () => {
    if (!booking || !session?.user.id || !booking.properties) return;
    if (rating === 0) {
      Alert.alert('Choose a rating', 'Select one to five bones before submitting your review.');
      return;
    }
    try {
      setIsSaving(true);
      const photoUrls = isHostReview ? [] : await uploadPhotos();
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
        nearby_distractions: isHostReview ? [] : nearbyDistractions.split(',').map((item) => item.trim()).filter(Boolean),
        unexpected_encounters: isHostReview ? '' : unexpectedEncounters.trim(),
        photo_urls: photoUrls,
      });
      if (error) throw error;
      router.replace(isHostReview ? '/host-dashboard' : '/dashboard');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        Alert.alert('Review already submitted', 'You can submit one review for each completed visit.');
      } else {
        Alert.alert('Unable to save review', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} /></View></SafeAreaView>;
  if (!booking?.properties) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.emptyText}>This completed visit is unavailable for review.</Text></View></SafeAreaView>;
  if (existingReview) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.title}>Review submitted</Text><Text style={styles.doneText}>You have already shared feedback for this visit.</Text><Pressable onPress={() => router.back()} style={styles.exitButton}><Text style={styles.exitText}>Back</Text></Pressable></View></SafeAreaView>;

  const title = isHostReview ? 'How was this guest visit?' : `How was ${booking.properties.name}?`;
  const description = isHostReview
    ? 'Rate the visit and share useful feedback about communication and care for the space.'
    : 'Your public site review helps other dog families find a safe, comfortable place to visit.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>Back</Text></Pressable>
        <Text style={styles.eyebrow}>{isHostReview ? 'GUEST FEEDBACK' : 'SITE REVIEW'}</Text>
        <Text style={styles.title}>{title}</Text>
        {!isHostReview ? <Text style={styles.siteLocation}>{booking.properties.city}, {booking.properties.state}</Text> : null}
        <Text style={styles.description}>{description}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Overall rating</Text>
          <View style={styles.bones}>
            {[1, 2, 3, 4, 5].map((bone) => <Pressable accessibilityLabel={`${bone} of 5 bones`} accessibilityRole="button" key={bone} onPress={() => setRating(bone)} style={[styles.boneButton, bone <= rating && styles.boneButtonActive]}><Text style={[styles.boneText, bone <= rating && styles.boneTextActive]}>{bone}</Text></Pressable>)}
          </View>
          <Text style={styles.ratingText}>{rating === 0 ? 'Choose a rating' : `${rating} of 5 bones`}</Text>

          {isHostReview ? (
            <>
              <Text style={styles.label}>Was communication clear and timely?</Text>
              <AnswerPicker value={guestCommunication} onChange={setGuestCommunication} />
              <Text style={styles.label}>Did they follow your site rules?</Text>
              <AnswerPicker value={houseRulesFollowed} onChange={setHouseRulesFollowed} />
            </>
          ) : (
            <>
              <Text style={styles.label}>Was the fencing secure?</Text>
              <AnswerPicker value={fenceSecurity} onChange={setFenceSecurity} />
              <Text style={styles.label}>Was the space clean and ready?</Text>
              <AnswerPicker value={cleanliness} onChange={setCleanliness} />
              <Text style={styles.label}>Nearby distractions (optional)</Text>
              <TextInput accessibilityLabel="Nearby distractions" maxLength={250} onChangeText={setNearbyDistractions} placeholder="Dogs, animals, people (comma-separated)" placeholderTextColor="#8A877D" style={styles.shortInput} value={nearbyDistractions} />
              <Text style={styles.label}>Anything unexpected? (optional)</Text>
              <TextInput accessibilityLabel="Unexpected encounters" maxLength={500} multiline onChangeText={setUnexpectedEncounters} placeholder="Share any helpful detail for future guests." placeholderTextColor="#8A877D" style={styles.input} value={unexpectedEncounters} />
            </>
          )}

          <Text style={styles.label}>Written feedback (optional)</Text>
          <TextInput accessibilityLabel="Review write-up" maxLength={500} multiline onChangeText={setReviewText} placeholder={isHostReview ? 'What would help another host prepare for this guest?' : 'What should another dog family know about this space?'} placeholderTextColor="#8A877D" style={styles.input} value={reviewText} />
          <Text style={styles.counter}>{reviewText.length}/500</Text>

          {!isHostReview ? <>
            <Text style={styles.label}>Photos from your visit (optional)</Text>
            <Text style={styles.helperText}>Up to four photos can be included with this public site review.</Text>
            <Pressable accessibilityRole="button" onPress={() => void addPhotos()} style={styles.photoButton}><Text style={styles.photoButtonText}>Add photos</Text></Pressable>
            <View style={styles.photoRow}>{photoUris.map((uri) => <Image key={uri} source={{ uri }} style={styles.photo} />)}</View>
          </> : null}

          <Text style={styles.visibilityNote}>{isHostReview ? 'This review is shared with verified K9 Country members.' : 'This review is public to verified K9 Country members.'}</Text>
          <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void submitReview()} style={[styles.submitButton, isSaving && styles.disabled]}>{isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.submitText}>Share review</Text>}</Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AnswerPicker({ value, onChange }: { value: Answer; onChange: (value: Answer) => void }) {
  return <View style={styles.choiceRow}>{(['yes', 'no', 'not_sure'] as const).map((option) => <Pressable accessibilityRole="button" key={option} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceSelected]}><Text style={[styles.choiceText, value === option && styles.choiceTextSelected]}>{option === 'not_sure' ? 'Not sure' : option === 'yes' ? 'Yes' : 'No'}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 44 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 8 },
  title: { color: colors.forest, fontSize: 29, fontWeight: '900', marginTop: 7 },
  siteLocation: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 6 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  card: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 18 },
  label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginBottom: 9, marginTop: 18 },
  bones: { flexDirection: 'row', gap: 8 },
  boneButton: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  boneButtonActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  boneText: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  boneTextActive: { color: colors.warmWhite },
  ratingText: { color: colors.muted, fontSize: 13, marginTop: 8 },
  input: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, minHeight: 112, padding: 12, textAlignVertical: 'top' },
  shortInput: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, minHeight: 50, padding: 12 },
  counter: { color: colors.muted, fontSize: 12, marginTop: 5, textAlign: 'right' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  choiceSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  choiceText: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  choiceTextSelected: { color: colors.warmWhite },
  helperText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  photoButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 46, marginBottom: 10 },
  photoButtonText: { color: colors.brown, fontWeight: '900' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { borderRadius: 10, height: 72, width: 72 },
  visibilityNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 20 },
  submitButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 14, minHeight: 54 },
  submitText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  emptyText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  doneText: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: 'center' },
  exitButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 48, paddingHorizontal: 24 },
  exitText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
});
