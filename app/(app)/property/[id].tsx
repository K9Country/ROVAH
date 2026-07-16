import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../../constants/theme';
import { ensureMessagingSession } from '../../../lib/anonymous-session';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../services/auth-context';
import type {
  Property,
  PropertyAvailability,
  PropertyDateAvailability,
  PropertyDraftDetails,
  PropertyImage,
} from '../../../types/property';
import type { BookingReview } from '../../../types/review';

type ListingImage = PropertyImage & { signed_url?: string };
type BookingBlock = { start_at: string; end_at: string };
type SlotPickerKind = 'start' | 'end' | null;

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const amenityLabels: Record<string, string> = {
  water: 'Water bowl', shade: 'Shade', picnic_table: 'Picnic table', restroom: 'Restroom',
  parking: 'Parking', tennis_ball: 'Tennis ball', frisbee: 'Frisbee',
  agility_equipment: 'Agility equipment', swimming_pool: 'Swimming pool', agility_course: 'Agility course', hiking_trails: 'Hiking trails', lake_access: 'Lake access', cell_service: 'Cell service',
  wheelchair_accessible: 'Wheelchair accessible',
};

const emptyDetails: PropertyDraftDetails = {
  property_id: '', parking_instructions: '', gate_access_instructions: '',
  arrival_instructions: '', property_rules: '', availability_notes: '',
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timesOnDate(date: Date, time: string) {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number);
  const value = startOfDay(date);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function formatMilitaryTime(time: Date) {
  const hours = time.getHours();
  const minutes = String(time.getMinutes()).padStart(2, '0');

  if (hours === 12 && time.getMinutes() === 0) {
    return 'Noon';
  }

  const displayHour = hours % 12 || 12;
  const period = hours < 12 ? 'a.m.' : 'p.m.';

  return `${displayHour}:${minutes} ${period}`;
}

function formatSelectedDate(date: Date | null) {
  return date
    ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Select a date';
}

function datesInCalendarMonth(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export default function PropertyDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isHost, isMember, session } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [details, setDetails] = useState<PropertyDraftDetails>(emptyDetails);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [availability, setAvailability] = useState<PropertyAvailability[]>([]);
  const [dateAvailability, setDateAvailability] = useState<PropertyDateAvailability[]>([]);
  const [bookingBlocks, setBookingBlocks] = useState<BookingBlock[]>([]);
  const [hostReviews, setHostReviews] = useState<BookingReview[]>([]);
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [selectedReview, setSelectedReview] = useState<BookingReview | null>(null);
  const [showReviews, setShowReviews] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));
  const [bookingDate, setBookingDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [dogCount, setDogCount] = useState(1);
  const [slotPicker, setSlotPicker] = useState<SlotPickerKind>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [hasConfirmedReservation, setHasConfirmedReservation] = useState(false);
  const recordedViewPropertyId = useRef<string | null>(null);

  const loadListing = useCallback(async () => {
    if (!id) {
      setErrorMessage('This property could not be found.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    await ensureMessagingSession(currentSession);

    const [propertyResult, detailsResult, amenitiesResult, availabilityResult, imagesResult, bookingBlocksResult, dateAvailabilityResult] = await Promise.all([
      supabase.from('properties').select('*').eq('id', id).eq('is_published', true).maybeSingle(),
      supabase.from('property_draft_details').select('*').eq('property_id', id).maybeSingle(),
      supabase.from('property_amenities').select('amenity_code').eq('property_id', id),
      supabase.from('property_availability').select('day_of_week, start_time, end_time').eq('property_id', id).order('day_of_week'),
      supabase.from('property_images').select('*').eq('property_id', id).order('display_order'),
      supabase.from('property_booking_blocks').select('start_at, end_at').eq('property_id', id).gte('end_at', new Date().toISOString()),
      supabase.from('property_date_availability').select('*').eq('property_id', id).order('availability_date'),
    ]);

    const firstError = [propertyResult.error, detailsResult.error, amenitiesResult.error, availabilityResult.error, imagesResult.error, bookingBlocksResult.error, dateAvailabilityResult.error].find(Boolean);
    if (firstError) {
      setErrorMessage(firstError.message);
      setIsLoading(false);
      return;
    }

    const imageRows = (imagesResult.data ?? []) as PropertyImage[];
    const imagesWithUrls = await Promise.all(imageRows.map(async (image) => {
      const { data } = await supabase.storage.from('property-images').createSignedUrl(image.storage_path, 60 * 60);
      return { ...image, signed_url: data?.signedUrl };
    }));

    setProperty(propertyResult.data as Property | null);
    setDetails((detailsResult.data as PropertyDraftDetails | null) ?? emptyDetails);
    setAmenities((amenitiesResult.data ?? []).map((item) => item.amenity_code));
    setAvailability((availabilityResult.data ?? []) as PropertyAvailability[]);
    setDateAvailability((dateAvailabilityResult.data ?? []) as PropertyDateAvailability[]);
    setBookingBlocks((bookingBlocksResult.data ?? []) as BookingBlock[]);
    setImages(imagesWithUrls);
    setIsLoading(false);

    if (propertyResult.data && session?.user.id) {
      const { data: reservation } = await supabase
        .from('bookings')
        .select('id')
        .eq('property_id', propertyResult.data.id)
        .eq('guest_id', session.user.id)
        .eq('status', 'confirmed')
        .limit(1)
        .maybeSingle();
      setHasConfirmedReservation(Boolean(reservation));
    } else {
      setHasConfirmedReservation(false);
    }

    if (propertyResult.data && session?.user.id) {
      const { data: reviewData } = await supabase
        .from('booking_reviews')
        .select('*')
        .eq('review_type', 'guest_to_host')
        .eq('property_id', propertyResult.data.id)
        .order('created_at', { ascending: false });
      const reviews = (reviewData ?? []) as BookingReview[];
      setHostReviews(reviews);
      const reviewerIds = [...new Set(reviews.map((review) => review.reviewer_id))];
      if (reviewerIds.length > 0) {
        const { data: profileRows } = await supabase.from('messaging_profiles').select('user_id, display_name').in('user_id', reviewerIds);
        setReviewerNames(Object.fromEntries((profileRows ?? []).map((profile) => [profile.user_id, profile.display_name])));
      } else setReviewerNames({});
    } else {
      setHostReviews([]);
    }

    if (propertyResult.data && recordedViewPropertyId.current !== id) {
      recordedViewPropertyId.current = id;
      void supabase.rpc('record_property_view', {
        target_property_id: id,
      });
    }
  }, [id, session?.user.id]);

  useEffect(() => { void loadListing(); }, [loadListing]);

  const blocksTime = useCallback((start: Date, end: Date) => (
    bookingBlocks.some((block) => new Date(block.start_at) < end && new Date(block.end_at) > start)
  ), [bookingBlocks]);

  const getDateAvailability = useCallback((date: Date) => {
    const override = dateAvailability.find((item) => item.availability_date === dateKey(date));
    if (override) {
      return override.is_open && override.start_time && override.end_time
        ? { start_time: override.start_time, end_time: override.end_time }
        : null;
    }

    return availability.find((day) => day.day_of_week === date.getDay()) ?? null;
  }, [availability, dateAvailability]);

  const getAvailableStartSlots = useCallback((date: Date) => {
    if (property?.is_temporarily_closed) return [];
    const today = startOfDay(new Date());
    if (startOfDay(date) < today) return [];
    const dayAvailability = getDateAvailability(date);
    if (!dayAvailability) return [];

    const opening = timesOnDate(date, dayAvailability.start_time);
    const closing = timesOnDate(date, dayAvailability.end_time);
    const slots: Date[] = [];
    for (let slot = new Date(opening); slot.getTime() + 3_600_000 <= closing.getTime(); slot = new Date(slot.getTime() + 1_800_000)) {
      const slotEnd = new Date(slot.getTime() + 3_600_000);
      if (!blocksTime(slot, slotEnd)) slots.push(slot);
    }
    return slots;
  }, [blocksTime, getDateAvailability, property?.is_temporarily_closed]);

  const getAvailableEndSlots = useCallback((date: Date, selectedStart: Date) => {
    const dayAvailability = getDateAvailability(date);
    if (!dayAvailability) return [];
    const closing = timesOnDate(date, dayAvailability.end_time);
    const slots: Date[] = [];
    for (let slot = new Date(selectedStart.getTime() + 3_600_000); slot <= closing; slot = new Date(slot.getTime() + 1_800_000)) {
      if (!blocksTime(selectedStart, slot)) slots.push(slot);
      else break;
    }
    return slots;
  }, [blocksTime, getDateAvailability]);

  const availableStartSlots = useMemo(() => bookingDate ? getAvailableStartSlots(bookingDate) : [], [bookingDate, getAvailableStartSlots]);
  const availableEndSlots = useMemo(() => bookingDate && startTime ? getAvailableEndSlots(bookingDate, startTime) : [], [bookingDate, getAvailableEndSlots, startTime]);
  const visitHours = startTime && endTime ? Math.max(0, (endTime.getTime() - startTime.getTime()) / 3_600_000) : 0;
  const additionalDogRate = property ? Number(property.price_per_hour) * 0.5 : 0;
  const estimatedTotal = property ? visitHours * (Number(property.price_per_hour) + Math.max(0, dogCount - 1) * additionalDogRate) : 0;
  const calendarDates = useMemo(() => datesInCalendarMonth(calendarMonth), [calendarMonth]);

  const chooseDate = (date: Date) => {
    if (getAvailableStartSlots(date).length === 0) return;
    setBookingDate(startOfDay(date));
    setStartTime(null);
    setEndTime(null);
  };

  const chooseStartTime = (time: Date) => {
    setStartTime(time);
    setEndTime(null);
    setSlotPicker(null);
  };

  const chooseEndTime = (time: Date) => {
    setEndTime(time);
    setSlotPicker(null);
  };

  const reserveSpace = async () => {
    if (!isMember || !session?.user.id) {
      Alert.alert(
        'Member sign-in required',
        'You can browse and message a host without an account. Sign in or create a member account before reserving a time.',
        [
          {
            text: 'Member Sign In',
            onPress: () => router.push('/sign-in?intent=guest' as never),
          },
          { text: 'Not Now', style: 'cancel' },
        ]
      );
      return;
    }
    if (!property) {
      return;
    }
    const { data: guestProfile, error: guestProfileError } = await supabase
      .from('guest_profiles')
      .select('profile_completed_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (guestProfileError) {
      Alert.alert('Unable to check your profile', 'Please try reserving again.');
      return;
    }

    if (!guestProfile?.profile_completed_at) {
      Alert.alert(
        'Complete your guest profile',
        'Your private contact details and dog information are required before your first reservation. Hosts cannot see this information.',
        [
          { text: 'Complete Profile', onPress: () => router.push('/profile' as never) },
          { text: 'Not Now', style: 'cancel' },
        ]
      );
      return;
    }
    if (property.is_temporarily_closed) {
      Alert.alert('Private space temporarily closed', 'This host is not accepting new reservations right now.');
      return;
    }
    if (!bookingDate || !startTime || !endTime) {
      Alert.alert('Select your visit time', 'Choose an available date, start time, and end time.');
      return;
    }
    if (endTime.getTime() - startTime.getTime() < 3_600_000) {
      Alert.alert('One-hour minimum', 'Reservations must be at least one full hour.');
      return;
    }

    try {
      setIsBooking(true);
      const { data, error } = await supabase.from('bookings').insert({
        property_id: property.id, guest_id: session.user.id, start_at: startTime.toISOString(), end_at: endTime.toISOString(), dog_count: dogCount,
      }).select('id, total_amount, payment_status').single();
      if (error) {
        if (error.code === '23P01') {
          await loadListing();
          setStartTime(null);
          setEndTime(null);
          Alert.alert('That time was just reserved', 'The calendar has been refreshed. Please choose another available time.');
          return;
        }
        throw error;
      }
      const { error: notificationError } = await supabase.functions.invoke('notify-host-of-reservation', {
        body: { bookingId: data.id },
      });
      if (notificationError) {
        console.warn('Host reservation SMS was not sent:', notificationError.message);
      }
      Alert.alert('Reservation confirmed', `${property.name} is reserved for ${formatSelectedDate(bookingDate)} from ${formatMilitaryTime(startTime)} to ${formatMilitaryTime(endTime)}.\n\nReservation total: $${Number(data.total_amount).toFixed(2)}\n\nPayments are still being set up, so no money has been collected for this test reservation.`, [{ text: 'View My Reservations', onPress: () => router.replace('/reservations') }]);
    } catch (error) {
      Alert.alert('Unable to reserve this time', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

  if (isLoading) return <SafeAreaView style={styles.safeArea}><View style={styles.centeredState}><ActivityIndicator color={colors.forest} size="large" /><Text style={styles.stateText}>Loading property details...</Text></View></SafeAreaView>;
  if (!property || errorMessage) return <SafeAreaView style={styles.safeArea}><View style={styles.centeredState}><Text style={styles.stateTitle}>Property unavailable</Text><Text style={styles.stateText}>{errorMessage ?? 'This property is no longer available to view.'}</Text><Pressable onPress={() => router.back()} style={styles.backToSearchButton}><Text style={styles.backToSearchText}>Back to Discover</Text></Pressable></View></SafeAreaView>;

  const coverImage =
    images.find((image) => image.id === selectedImageId) ??
    images.find((image) => image.is_cover) ??
    images[0];
  const location = `${property.city}, ${property.state}`;
  const canOpenMaps = isHost || hasConfirmedReservation;
  const openGoogleMaps = () => {
    if (!canOpenMaps) {
      Alert.alert(
        'Exact location available after booking',
        'To protect private sites, K9 Country shares the exact address and Google Maps link after a reservation is confirmed.'
      );
      return;
    }

    const query = [property.site_address, property.city, property.state, property.postal_code].filter(Boolean).join(', ');
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

    void Linking.openURL(mapsUrl).catch(() => {
      Alert.alert('Unable to open Google Maps', 'Please try again in a moment.');
    });
  };
  const siteRating = hostReviews.length > 0
    ? hostReviews.reduce((total, review) => total + review.bone_rating, 0) / hostReviews.length
    : null;
  const slotOptions = slotPicker === 'start' ? availableStartSlots : availableEndSlots;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>← Find a private space</Text></Pressable>
        {coverImage?.signed_url ? <Image source={{ uri: coverImage.signed_url }} style={styles.coverImage} /> : <View style={styles.coverPlaceholder}><Text style={styles.coverPlaceholderText}>Property photo</Text></View>}
        {images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>{images.map((image, index) => image.signed_url ? <Pressable accessibilityLabel={`Show property photo ${index + 1}`} accessibilityRole="button" key={image.id} onPress={() => setSelectedImageId(image.id)} style={[styles.thumbnailButton, image.id === coverImage?.id && styles.thumbnailButtonSelected]}><Image source={{ uri: image.signed_url }} style={styles.thumbnail} /></Pressable> : null)}</ScrollView> : null}
        <Text style={styles.title}>{property.name}</Text><Text style={styles.location}>{location}</Text><Pressable accessibilityRole="button" onPress={() => setShowReviews(true)} style={{ alignItems: 'flex-start', marginTop: 8 }}><Text style={{ color: colors.brown, fontSize: 15, fontWeight: '900' }}>{siteRating === null ? 'No guest ratings yet' : `🦴 ${siteRating.toFixed(1)} guest rating`}</Text><Text style={{ color: colors.brown, fontSize: 12, fontWeight: '700', marginTop: 4, textDecorationLine: 'underline' }}>View reviews</Text></Pressable>
        <Text style={styles.price}>${Number(property.price_per_hour).toFixed(0)} <Text style={styles.priceUnit}>per hour</Text></Text><Text style={styles.description}>{property.short_description}</Text>

        <Pressable
          accessibilityLabel={`Open ${property.name} in Google Maps`}
          accessibilityRole="link"
          onPress={openGoogleMaps}
          style={[styles.mapsButton, !canOpenMaps && styles.mapsButtonLocked]}
        >
          <Text style={styles.mapsButtonText}>{canOpenMaps ? 'Open in Google Maps' : 'Exact address after booking'}</Text>
          <Text style={styles.mapsButtonIcon}>↗</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Message the host of ${property.name}`}
          accessibilityRole="button"
          onPress={() => router.push(`/messages/${property.id}` as never)}
          style={styles.messageHostButton}
        >
          <Text style={styles.messageHostButtonText}>Message Host</Text>
          <Text style={styles.messageHostButtonIcon}>💬</Text>
        </Pressable>

        <Section title="Know Before You Go"><InfoRow label="Parking" value={details.parking_instructions || 'Details will be provided before booking.'} /><InfoRow label="Gate access" value={details.gate_access_instructions || 'Details will be provided before booking.'} /><InfoRow label="Arrival" value={details.arrival_instructions || 'Details will be provided before booking.'} last /></Section>
        <Modal animationType="slide" onRequestClose={() => setShowReviews(false)} transparent visible={showReviews}><View style={styles.reviewModalBackdrop}><View style={styles.reviewModal}><Text style={styles.reviewerName}>Site reviews</Text>{hostReviews.length > 0 ? hostReviews.map((review) => <Pressable accessibilityRole="button" key={review.id} onPress={() => { setShowReviews(false); setSelectedReview(review); }} style={{ backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 10, padding: 14 }}><Text style={styles.reviewerName}>{reviewerNames[review.reviewer_id] ?? 'K9 Country guest'}</Text><Text style={styles.hostReviewDate}>{new Date(review.created_at).toLocaleDateString()} · {review.bone_rating.toFixed(1)} rating</Text></Pressable>) : <Text style={styles.emptyText}>No public site reviews have been shared yet.</Text>}<Pressable onPress={() => setShowReviews(false)} style={styles.closeReviewButton}><Text style={styles.closeReviewText}>Close</Text></Pressable></View></View></Modal>
        <Modal animationType="slide" onRequestClose={() => setSelectedReview(null)} transparent visible={selectedReview !== null}><View style={styles.reviewModalBackdrop}><View style={styles.reviewModal}><Text style={styles.reviewerName}>{selectedReview ? reviewerNames[selectedReview.reviewer_id] ?? 'K9 Country guest' : ''}</Text><Text style={styles.hostReviewDate}>{selectedReview ? `${selectedReview.bone_rating.toFixed(1)} rating · ${new Date(selectedReview.created_at).toLocaleDateString()}` : ''}</Text><Text style={styles.fullReviewText}>{selectedReview?.review_text || 'No written note shared.'}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{(selectedReview?.photo_urls ?? []).map((uri) => <Image key={uri} source={{ uri }} style={{ borderRadius: 10, height: 100, width: 100 }} />)}</View><Pressable onPress={() => setSelectedReview(null)} style={styles.closeReviewButton}><Text style={styles.closeReviewText}>Close</Text></Pressable></View></View></Modal>
        <Section title="Amenities">{amenities.length > 0 ? <View style={styles.amenityGrid}>{amenities.map((amenity) => <View key={amenity} style={styles.amenityPill}><Text style={styles.amenityText}>{amenityLabels[amenity] ?? amenity}</Text></View>)}</View> : <Text style={styles.emptyText}>No amenities have been listed yet.</Text>}</Section>
        <Section title="Property Rules"><Text style={styles.rulesText}>{details.property_rules || 'No additional rules have been listed.'}</Text></Section>

        <View style={styles.bookingCard}>
          <Text style={styles.bookingEyebrow}>START YOUR BOOKING</Text><Text style={styles.bookingTitle}>Reserve this private space</Text><Text style={styles.bookingText}>Green dates have at least one available one-hour visit. Red dates are closed or fully booked.</Text>
          {property.is_temporarily_closed ? <Text style={styles.temporarilyClosedText}>This private space is temporarily closed and is not accepting new reservations.</Text> : null}
          <View style={styles.calendarHeader}><Pressable accessibilityLabel="Previous month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable><Text style={styles.monthTitle}>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</Text><Pressable accessibilityLabel="Next month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable></View>
          <View style={styles.weekdayRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekdayLabel}>{day}</Text>)}</View>
          <View style={styles.calendarGrid}>{calendarDates.map((date) => {
            const inCurrentMonth = date.getMonth() === calendarMonth.getMonth();
            const available = inCurrentMonth && getAvailableStartSlots(date).length > 0;
            const selected = bookingDate && dateKey(date) === dateKey(bookingDate);
            return <Pressable key={dateKey(date)} disabled={!available} onPress={() => chooseDate(date)} style={[styles.calendarDay, available ? styles.calendarDayAvailable : styles.calendarDayUnavailable, selected && styles.calendarDaySelected, !inCurrentMonth && styles.calendarDayOutsideMonth]}><Text style={[styles.calendarDayText, !available && styles.calendarDayTextUnavailable, selected && styles.calendarDayTextSelected]}>{date.getDate()}</Text></Pressable>;
          })}</View>
          <Text style={styles.selectedDateText}>{formatSelectedDate(bookingDate)}</Text>
          <Text style={styles.fieldLabel}>Start time</Text>
          <Pressable disabled={!bookingDate || availableStartSlots.length === 0} onPress={() => setSlotPicker('start')} style={[styles.selectorButton, (!bookingDate || availableStartSlots.length === 0) && styles.selectorDisabled]}><Text style={styles.selectorButtonText}>{startTime ? formatMilitaryTime(startTime) : 'Select start time'}</Text><Text style={styles.selectorHint}>⌄</Text></Pressable>
          <Text style={styles.fieldLabel}>End time</Text>
          <Pressable disabled={!startTime || availableEndSlots.length === 0} onPress={() => setSlotPicker('end')} style={[styles.selectorButton, (!startTime || availableEndSlots.length === 0) && styles.selectorDisabled]}><Text style={styles.selectorButtonText}>{endTime ? formatMilitaryTime(endTime) : 'Select end time'}</Text><Text style={styles.selectorHint}>⌄</Text></Pressable>
          <Text style={styles.minimumText}>One-hour minimum; times are offered only on the hour and half hour.</Text>
          <Text style={styles.fieldLabel}>Number of dogs</Text>
          <View style={styles.dogCountRow}><Pressable accessibilityRole="button" disabled={dogCount === 1} onPress={() => setDogCount((count) => Math.max(1, count - 1))} style={[styles.dogCountButton, dogCount === 1 && styles.dogCountButtonDisabled]}><Text style={styles.dogCountButtonText}>−</Text></Pressable><Text style={styles.dogCountValue}>{dogCount}</Text><Pressable accessibilityRole="button" onPress={() => setDogCount((count) => count + 1)} style={styles.dogCountButton}><Text style={styles.dogCountButtonText}>+</Text></Pressable></View>
          <Text style={styles.dogFeeText}>Each additional dog is ${additionalDogRate.toFixed(2)} per hour (50% of the base hourly fee).</Text>
          <View style={styles.estimateRow}><Text style={styles.estimateLabel}>Rental Fee</Text><Text style={styles.estimateValue}>${estimatedTotal.toFixed(2)}</Text></View>
          <Pressable disabled={property.is_temporarily_closed || isBooking || !endTime} onPress={reserveSpace} style={[styles.bookingButton, (property.is_temporarily_closed || isBooking || !endTime) && styles.buttonDisabled]}>{isBooking ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.bookingButtonText}>Confirm and Check Out</Text>}</Pressable>
        </View>
      </ScrollView>

      <Modal animationType="slide" transparent visible={slotPicker !== null} onRequestClose={() => setSlotPicker(null)}>
        <Pressable onPress={() => setSlotPicker(null)} style={styles.modalBackdrop}>
          <Pressable onPress={() => undefined} style={styles.slotSheet}>
            <Text style={styles.slotSheetTitle}>{slotPicker === 'start' ? 'Choose a start time' : 'Choose an end time'}</Text>
            <Text style={styles.slotSheetText}>Only available 30-minute times are shown.</Text>
            <ScrollView contentContainerStyle={styles.slotList}>{slotOptions.map((slot) => <Pressable key={slot.toISOString()} onPress={() => slotPicker === 'start' ? chooseStartTime(slot) : chooseEndTime(slot)} style={styles.slotButton}><Text style={styles.slotButtonText}>{formatMilitaryTime(slot)}</Text></Pressable>)}</ScrollView>
            <Pressable onPress={() => setSlotPicker(null)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.infoRow, !last && styles.infoRowDivider]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 42 }, centeredState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 }, stateTitle: { color: colors.forest, fontSize: 24, fontWeight: '900', textAlign: 'center' }, stateText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: 'center' }, backToSearchButton: { backgroundColor: colors.forest, borderRadius: 13, marginTop: 22, minHeight: 50, paddingHorizontal: 20, justifyContent: 'center' }, backToSearchText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' }, backButton: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', marginBottom: 10 }, backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '900' }, coverImage: { borderRadius: 20, height: 260, width: '100%' }, coverPlaceholder: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 20, height: 260, justifyContent: 'center' }, coverPlaceholderText: { color: colors.muted, fontSize: 15, fontWeight: '800' }, photoStrip: { gap: 10, marginTop: 10 }, thumbnailButton: { borderColor: 'transparent', borderRadius: 12, borderWidth: 3, overflow: 'hidden' }, thumbnailButtonSelected: { borderColor: colors.forest }, thumbnail: { height: 70, width: 92 }, eyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginTop: 22 }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 6 }, location: { color: colors.muted, fontSize: 16, marginTop: 5 }, price: { color: colors.forest, fontSize: 25, fontWeight: '900', marginTop: 15 }, priceUnit: { color: colors.muted, fontSize: 14, fontWeight: '700' }, description: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 14, marginTop: 14 }, mapsButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', marginBottom: 10, minHeight: 52 }, mapsButtonLocked: { backgroundColor: colors.olive }, mapsButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, mapsButtonIcon: { color: colors.warmWhite, fontSize: 20, marginLeft: 8 }, messageHostButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.brown, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginBottom: 22, minHeight: 52 }, messageHostButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' }, messageHostButtonIcon: { fontSize: 18, marginLeft: 8 }, section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 14, padding: 17 }, sectionTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 12 }, infoRow: { paddingVertical: 11 }, infoRowDivider: { borderBottomColor: colors.border, borderBottomWidth: 1 }, infoLabel: { color: colors.forest, fontSize: 14, fontWeight: '900' }, infoValue: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, amenityPill: { backgroundColor: colors.lightGreen, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, amenityText: { color: colors.olive, fontSize: 13, fontWeight: '800' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21 }, rulesText: { color: colors.muted, fontSize: 15, lineHeight: 23 }, reviewIntro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 }, hostReview: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 12, paddingTop: 12 }, hostReviewBones: { fontSize: 20, letterSpacing: 1 }, emptyBones: { opacity: 0.18 }, hostReviewDate: { color: colors.brown, fontSize: 12, fontWeight: '800', marginTop: 7 }, hostReviewText: { color: colors.forest, fontSize: 14, lineHeight: 21, marginTop: 6 }, hostReviewEmpty: { color: colors.muted, fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  bookingCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 20, borderWidth: 1, marginTop: 6, padding: 18 }, bookingEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, bookingTitle: { color: colors.forest, fontSize: 22, fontWeight: '900', marginTop: 6 }, bookingText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 18, marginTop: 7 }, calendarHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, monthButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 }, monthButtonText: { color: colors.forest, fontSize: 27, fontWeight: '700', lineHeight: 30 }, monthTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' }, weekdayRow: { flexDirection: 'row', marginBottom: 5 }, weekdayLabel: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '900', textAlign: 'center' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 }, calendarDay: { alignItems: 'center', borderRadius: 16, height: 34, justifyContent: 'center', width: '13.2%' }, calendarDayAvailable: { backgroundColor: '#BFD8B9' }, calendarDayUnavailable: { backgroundColor: '#F0C5C0' }, calendarDaySelected: { backgroundColor: colors.forest, borderColor: colors.warmWhite, borderWidth: 2 }, calendarDayOutsideMonth: { opacity: 0.35 }, calendarDayText: { color: colors.forest, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900' }, calendarDayTextUnavailable: { color: '#95423A' }, calendarDayTextSelected: { color: colors.warmWhite }, selectedDateText: { color: colors.forest, fontSize: 14, fontWeight: '900', marginTop: 14, textAlign: 'center' }, fieldLabel: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: 7, marginTop: 14 }, selectorButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 14 }, selectorDisabled: { backgroundColor: '#ECE6D9', opacity: 0.7 }, selectorButtonText: { color: colors.forest, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' }, selectorHint: { color: colors.brown, fontSize: 20, fontWeight: '900' }, minimumText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, dogCountRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 2 }, dogCountButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, height: 44, justifyContent: 'center', width: 48 }, dogCountButtonDisabled: { backgroundColor: '#9A968C' }, dogCountButtonText: { color: colors.warmWhite, fontSize: 24, fontWeight: '900' }, dogCountValue: { color: colors.forest, fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '900', minWidth: 60, textAlign: 'center' }, dogFeeText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' }, estimateRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }, estimateLabel: { color: colors.muted, fontSize: 14, fontWeight: '800' }, estimateValue: { color: colors.forest, fontSize: 21, fontWeight: '900' }, bookingButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 54 }, bookingButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, buttonDisabled: { opacity: 0.55 },
  reviewerName: { color: colors.forest, fontSize: 16, fontWeight: '900' }, reviewModalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'center', padding: 24 }, reviewModal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 440, padding: 22, width: '100%' }, fullReviewText: { color: colors.forest, fontSize: 16, lineHeight: 23, marginTop: 16 }, closeReviewButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 48 }, closeReviewText: { color: colors.warmWhite, fontWeight: '900' },
  temporarilyClosedText: { backgroundColor: '#F0C5C0', borderColor: '#D88A80', borderRadius: 10, borderWidth: 1, color: '#95423A', fontSize: 13, fontWeight: '800', lineHeight: 19, marginBottom: 14, padding: 11, textAlign: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'flex-end' }, slotSheet: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%', padding: 22 }, slotSheetTitle: { color: colors.forest, fontSize: 22, fontWeight: '900' }, slotSheetText: { color: colors.muted, fontSize: 14, marginTop: 5 }, slotList: { gap: 9, paddingBottom: 12, paddingTop: 18 }, slotButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, minHeight: 48, justifyContent: 'center' }, slotButtonText: { color: colors.forest, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' }, cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, cancelButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' },
});
