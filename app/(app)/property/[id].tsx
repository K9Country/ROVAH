import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GooglePropertyMap from '../../../components/google-property-map';
import { HostPageGuide } from '../../../components/host-page-guide';
import { memberUi } from '../../../constants/member-ui';
import { colors } from '../../../constants/theme';
import { propertyTimeZoneLabel } from '../../../constants/property-time-zones';
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
type BookingDog = { id: string; name: string; breed: string; size: string; behavior_traits: string[] };
type LoyaltyPassOffer = { id: string; name: string; credit_count: number; package_price: number | string; duration_months: number };
type MemberLoyaltyPass = { id: string; loyalty_pass_offer_id: string; credit_hours_remaining: number | string; covered_dog_count: number; expires_at: string };
type CourtesyVisitCredit = { id: string; remaining_hours: number | string; expires_at: string; note: string | null };
type ResolutionDiscountOffer = { id: string; discount_percent: number | string; expires_at: string; note: string | null };
type SlotPickerKind = 'start' | 'end' | null;
type TimeSlotOption = { time: Date; isAvailable: boolean };

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const amenityLabels: Record<string, string> = {
  water: 'Water bowl', shade: 'Shade', picnic_table: 'Picnic table', restroom: 'Restroom',
  parking: 'Parking', tennis_ball: 'Tennis ball', frisbee: 'Frisbee',
  agility_equipment: 'Agility equipment', swimming_pool: 'Swimming pool', agility_course: 'Agility course', hiking_trails: 'Hiking trails', lake_access: 'Lake access', poop_bags: '💩 Poop bags',
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
  const { isMember, session } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [details, setDetails] = useState<PropertyDraftDetails>(emptyDetails);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [availability, setAvailability] = useState<PropertyAvailability[]>([]);
  const [dateAvailability, setDateAvailability] = useState<PropertyDateAvailability[]>([]);
  const [bookingBlocks, setBookingBlocks] = useState<BookingBlock[]>([]);
  const [loyaltyPassOffers, setLoyaltyPassOffers] = useState<LoyaltyPassOffer[]>([]);
  const [memberLoyaltyPasses, setMemberLoyaltyPasses] = useState<MemberLoyaltyPass[]>([]);
  const [selectedLoyaltyPassOfferId, setSelectedLoyaltyPassOfferId] = useState<string | null>(null);
  const [hasChosenReservationRate, setHasChosenReservationRate] = useState(false);
  const [courtesyVisitCredits, setCourtesyVisitCredits] = useState<CourtesyVisitCredit[]>([]);
  const [selectedCourtesyCreditId, setSelectedCourtesyCreditId] = useState<string | null>(null);
  const [resolutionDiscountOffers, setResolutionDiscountOffers] = useState<ResolutionDiscountOffer[]>([]);
  const [selectedResolutionDiscountOfferId, setSelectedResolutionDiscountOfferId] = useState<string | null>(null);
  const [hostReviews, setHostReviews] = useState<BookingReview[]>([]);
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});
  const [completedReservationCount, setCompletedReservationCount] = useState<number | null>(null);
  const [selectedReview, setSelectedReview] = useState<BookingReview | null>(null);
  const [showReviews, setShowReviews] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfDay(new Date()));
  const [bookingDate, setBookingDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [dogProfiles, setDogProfiles] = useState<BookingDog[]>([]);
  const [selectedDogIds, setSelectedDogIds] = useState<string[]>([]);
  const [isDogProfilesLoading, setIsDogProfilesLoading] = useState(false);
  const [slotPicker, setSlotPicker] = useState<SlotPickerKind>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isBooking, setIsBooking] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [needsGuestProfile, setNeedsGuestProfile] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowSaving, setIsFollowSaving] = useState(false);
  const recordedViewPropertyId = useRef<string | null>(null);

  useEffect(() => {
    const refreshCurrentTime = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(refreshCurrentTime);
  }, []);

  useEffect(() => {
    if (startTime && startTime.getTime() <= currentTime.getTime()) {
      setStartTime(null);
      setEndTime(null);
      setSlotPicker(null);
    }
  }, [currentTime, startTime]);

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

    const [propertyResult, detailsResult, amenitiesResult, availabilityResult, imagesResult, bookingBlocksResult, dateAvailabilityResult, loyaltyPassResult, completedReservationCountResult] = await Promise.all([
      supabase.from('properties').select('*').eq('id', id).eq('is_published', true).maybeSingle(),
      supabase.from('property_draft_details').select('*').eq('property_id', id).maybeSingle(),
      supabase.from('property_amenities').select('amenity_code').eq('property_id', id),
      supabase.from('property_availability').select('day_of_week, start_time, end_time, starts_on, ends_on').eq('property_id', id).order('day_of_week'),
      supabase.from('property_images').select('*').eq('property_id', id).order('display_order'),
      supabase.from('property_booking_blocks').select('start_at, end_at').eq('property_id', id).gte('end_at', new Date().toISOString()),
      supabase.from('property_date_availability').select('*').eq('property_id', id).order('availability_date'),
      supabase.from('loyalty_pass_offers').select('id, name, credit_count, package_price, duration_months').eq('property_id', id).order('created_at'),
      supabase.rpc('get_completed_reservation_count', { p_property_id: id }),
    ]);

    const firstError = [propertyResult.error, detailsResult.error, amenitiesResult.error, availabilityResult.error, imagesResult.error, bookingBlocksResult.error, dateAvailabilityResult.error, loyaltyPassResult.error, completedReservationCountResult.error].find(Boolean);
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
    setLoyaltyPassOffers((loyaltyPassResult.data ?? []) as LoyaltyPassOffer[]);
    setCompletedReservationCount(typeof completedReservationCountResult.data === 'number' ? completedReservationCountResult.data : 0);
    setImages(imagesWithUrls);
    setIsLoading(false);

    if (isMember && session?.user.id) {
      const { data: follow } = await supabase
        .from('property_follows')
        .select('id')
        .eq('property_id', id)
        .eq('member_id', session.user.id)
        .maybeSingle();
      setIsFollowing(Boolean(follow));
    } else {
      setIsFollowing(false);
    }

    if (propertyResult.data && session?.user.id) {
      const { data: reviewData } = await supabase
        .from('booking_reviews')
        .select('*')
        .eq('review_type', 'guest_to_host')
        .eq('property_id', propertyResult.data.id)
        .eq('comment_visibility', 'public')
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

  }, [id, isMember, session?.user.id]);

  useEffect(() => { void loadListing(); }, [loadListing]);

  useEffect(() => {
    if (!property?.id || !session?.user.id || !isMember) {
      setCourtesyVisitCredits([]);
      setSelectedCourtesyCreditId(null);
      setResolutionDiscountOffers([]);
      setSelectedResolutionDiscountOfferId(null);
      setMemberLoyaltyPasses([]);
      setSelectedLoyaltyPassOfferId(null);
      setHasChosenReservationRate(false);
      return;
    }
    setSelectedLoyaltyPassOfferId(null);
    setHasChosenReservationRate(false);
    const activeDate = new Date().toISOString();
    void Promise.all([
      supabase.from('courtesy_visit_credits').select('id, remaining_hours, expires_at, note').eq('property_id', property.id).eq('status', 'active').gte('expires_at', activeDate),
      supabase.from('resolution_discount_offers').select('id, discount_percent, expires_at, note').eq('property_id', property.id).eq('status', 'active').gte('expires_at', activeDate),
      supabase.from('member_loyalty_passes').select('id, loyalty_pass_offer_id, credit_hours_remaining, covered_dog_count, expires_at').eq('property_id', property.id).eq('status', 'active').gte('expires_at', activeDate),
    ]).then(([courtesyResult, discountResult, passResult]) => {
      setCourtesyVisitCredits((courtesyResult.data ?? []) as CourtesyVisitCredit[]);
      setResolutionDiscountOffers((discountResult.data ?? []) as ResolutionDiscountOffer[]);
      setMemberLoyaltyPasses((passResult.data ?? []) as MemberLoyaltyPass[]);
    });
  }, [isMember, property?.id, session?.user.id]);

  // Offers never stack. Keeping this rule in state as well as in the secure
  // booking function makes the displayed total match the selection exactly.
  useEffect(() => {
    if (selectedLoyaltyPassOfferId) {
      setSelectedCourtesyCreditId(null);
      setSelectedResolutionDiscountOfferId(null);
    }
  }, [selectedLoyaltyPassOfferId]);

  useEffect(() => {
    if (selectedCourtesyCreditId || selectedResolutionDiscountOfferId) {
      setSelectedLoyaltyPassOfferId(null);
    }
  }, [selectedCourtesyCreditId, selectedResolutionDiscountOfferId]);

  useEffect(() => {
    const checkGuestProfile = async () => {
      if (!session?.user.id) {
        setNeedsGuestProfile(false);
        return;
      }

      const { data } = await supabase
        .from('guest_profiles')
        .select('profile_completed_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      setNeedsGuestProfile(!data?.profile_completed_at);
    };

    void checkGuestProfile();
  }, [session?.user.id]);

  useEffect(() => {
    const loadDogProfiles = async () => {
      if (!isMember || !session?.user.id) {
        setDogProfiles([]);
        setSelectedDogIds([]);
        return;
      }

      setIsDogProfilesLoading(true);
      const { data, error } = await supabase
        .from('dog_profiles')
        .select('id, name, breed, size, behavior_traits')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      if (!error) setDogProfiles((data ?? []).map((dog) => ({ ...dog, behavior_traits: Array.isArray(dog.behavior_traits) ? dog.behavior_traits : [] })) as BookingDog[]);
      setIsDogProfilesLoading(false);
    };

    void loadDogProfiles();
  }, [isMember, session?.user.id]);

  useEffect(() => {
    const recordView = async () => {
      if (!property?.id || !session?.user.id || property.host_id === session.user.id) {
        return;
      }

      if (recordedViewPropertyId.current === property.id) {
        return;
      }

      const { error } = await supabase.rpc('record_property_view', {
        target_property_id: property.id,
      });

      if (error) {
        console.warn('Unable to record property view:', error.message);
        return;
      }

      recordedViewPropertyId.current = property.id;
    };

    void recordView();
  }, [property?.host_id, property?.id, session?.user.id]);

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

    const weeklySchedule = availability.find((day) => day.day_of_week === date.getDay());
    const key = dateKey(date);
    if (
      !weeklySchedule ||
      (weeklySchedule.starts_on && key < weeklySchedule.starts_on) ||
      (weeklySchedule.ends_on && key > weeklySchedule.ends_on)
    ) {
      return null;
    }

    return weeklySchedule;
  }, [availability, dateAvailability]);

  const getStartSlotOptions = useCallback((date: Date): TimeSlotOption[] => {
    if (property?.is_temporarily_closed) return [];
    const today = startOfDay(currentTime);
    if (startOfDay(date) < today) return [];
    const dayAvailability = getDateAvailability(date);
    if (!dayAvailability) return [];

    const opening = timesOnDate(date, dayAvailability.start_time);
    const closing = timesOnDate(date, dayAvailability.end_time);
    const slots: TimeSlotOption[] = [];
    for (let slot = new Date(opening); slot.getTime() + 3_600_000 <= closing.getTime(); slot = new Date(slot.getTime() + 1_800_000)) {
      const slotEnd = new Date(slot.getTime() + 3_600_000);
      slots.push({ time: slot, isAvailable: slot.getTime() > currentTime.getTime() && !blocksTime(slot, slotEnd) });
    }
    return slots;
  }, [blocksTime, currentTime, getDateAvailability, property?.is_temporarily_closed]);

  const getEndSlotOptions = useCallback((date: Date, selectedStart: Date): TimeSlotOption[] => {
    const dayAvailability = getDateAvailability(date);
    if (!dayAvailability) return [];
    const closing = timesOnDate(date, dayAvailability.end_time);
    const slots: TimeSlotOption[] = [];
    for (let slot = new Date(selectedStart.getTime() + 3_600_000); slot <= closing; slot = new Date(slot.getTime() + 1_800_000)) {
      slots.push({ time: slot, isAvailable: !blocksTime(selectedStart, slot) });
    }
    return slots;
  }, [blocksTime, getDateAvailability]);

  const startSlotOptions = useMemo(() => bookingDate ? getStartSlotOptions(bookingDate) : [], [bookingDate, getStartSlotOptions]);
  const endSlotOptions = useMemo(() => bookingDate && startTime ? getEndSlotOptions(bookingDate, startTime) : [], [bookingDate, getEndSlotOptions, startTime]);
  const availableStartSlots = useMemo(() => startSlotOptions.filter((slot) => slot.isAvailable).map((slot) => slot.time), [startSlotOptions]);
  const availableEndSlots = useMemo(() => endSlotOptions.filter((slot) => slot.isAvailable).map((slot) => slot.time), [endSlotOptions]);
  const visitHours = startTime && endTime ? Math.max(0, (endTime.getTime() - startTime.getTime()) / 3_600_000) : 0;
  const additionalDogRate = property ? Number(property.price_per_hour) * 0.5 : 0;
  const dogCount = selectedDogIds.length;
  const estimatedTotal = property ? visitHours * (Number(property.price_per_hour) + Math.max(0, dogCount - 1) * additionalDogRate) : 0;
  const selectedResolutionDiscount = resolutionDiscountOffers.find((offer) => offer.id === selectedResolutionDiscountOfferId);
  const resolutionDiscountAmount = selectedResolutionDiscount ? estimatedTotal * (Number(selectedResolutionDiscount.discount_percent) / 100) : 0;
  const selectedLoyaltyPassOffer = loyaltyPassOffers.find((offer) => offer.id === selectedLoyaltyPassOfferId);
  const selectedMemberLoyaltyPass = selectedLoyaltyPassOffer
    ? memberLoyaltyPasses.find((pass) => pass.loyalty_pass_offer_id === selectedLoyaltyPassOffer.id && pass.covered_dog_count >= Math.max(1, dogCount))
    : undefined;
  const selectedPassHasEnoughCredits = Boolean(
    selectedMemberLoyaltyPass
      && (!visitHours || Number(selectedMemberLoyaltyPass.credit_hours_remaining) >= visitHours),
  );
  const compatiblePassOffers = loyaltyPassOffers.filter((offer) => memberLoyaltyPasses.some((pass) => (
    pass.loyalty_pass_offer_id === offer.id
    && pass.covered_dog_count >= Math.max(1, dogCount)
    && (!visitHours || Number(pass.credit_hours_remaining) >= visitHours)
  )));

  // A guest who has exactly one subscription that covers this visit should not
  // have to discover and select it manually. They can always choose the regular
  // rate instead, but their eligible credits are the clear default.
  useEffect(() => {
    if (hasChosenReservationRate || selectedLoyaltyPassOfferId || selectedCourtesyCreditId || selectedResolutionDiscountOfferId) return;
    if (compatiblePassOffers.length === 1) setSelectedLoyaltyPassOfferId(compatiblePassOffers[0].id);
  }, [compatiblePassOffers, hasChosenReservationRate, selectedCourtesyCreditId, selectedLoyaltyPassOfferId, selectedResolutionDiscountOfferId]);
  const subscriptionDogCount = Math.max(1, dogCount);
  const oneDogPackageValue = selectedLoyaltyPassOffer && property
    ? selectedLoyaltyPassOffer.credit_count * Number(property.price_per_hour)
    : 0;
  const subscriptionDiscountRate = oneDogPackageValue > 0 && selectedLoyaltyPassOffer
    ? Math.max(0, Math.min(1, 1 - Number(selectedLoyaltyPassOffer.package_price) / oneDogPackageValue))
    : 0;
  const subscriptionTotal = selectedLoyaltyPassOffer && property
    ? selectedPassHasEnoughCredits
      ? 0
      : selectedLoyaltyPassOffer.credit_count * (Number(property.price_per_hour) + (subscriptionDogCount - 1) * additionalDogRate) * (1 - subscriptionDiscountRate)
    : 0;
  const subscriptionDurationUnsupported = Boolean(selectedLoyaltyPassOffer && visitHours > selectedLoyaltyPassOffer.credit_count);
  const courtesyVisitRequiresOneHour = Boolean(selectedCourtesyCreditId && visitHours !== 1);
  const reservationTotal = selectedCourtesyCreditId
    ? 0
    : selectedLoyaltyPassOffer
      ? subscriptionTotal
      : Math.max(0, estimatedTotal - resolutionDiscountAmount);
  const calendarDates = useMemo(() => datesInCalendarMonth(calendarMonth), [calendarMonth]);

  const chooseDate = (date: Date) => {
    if (!getStartSlotOptions(date).some((slot) => slot.isAvailable)) return;
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
    setReservationError(null);
    if (!isMember || !session?.user.id) {
      setReservationError('Sign in with your member account before confirming a reservation.');
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
      setReservationError('This private space is unavailable. Please return to search and try again.');
      return;
    }
    const { data: guestProfile, error: guestProfileError } = await supabase
      .from('guest_profiles')
      .select('profile_completed_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (guestProfileError) {
      setReservationError('We could not check your Parent Profile. Please try again.');
      Alert.alert('Unable to check your profile', 'Please try reserving again.');
      return;
    }

    if (!guestProfile?.profile_completed_at) {
      setReservationError('Complete your Parent Profile before confirming a reservation.');
      router.push(`/profile?returnTo=/property/${property.id}` as never);
      return;
    }
    if (!dogProfiles.length) {
      setReservationError('Add at least one Dog Profile before confirming a reservation.');
      Alert.alert('Add a dog profile first', 'Create a Dog Profile before reserving so your host knows which dog is visiting.', [
        { text: 'Create Dog Profile', onPress: () => router.push('/dog-profiles' as never) },
        { text: 'Not now', style: 'cancel' },
      ]);
      return;
    }
    if (!selectedDogIds.length) {
      setReservationError('Select every dog attending this reservation.');
      Alert.alert('Select attending dogs', 'Choose the dog or dogs joining this reservation.');
      return;
    }
    if (property.is_temporarily_closed) {
      setReservationError('This private space is temporarily closed and cannot accept reservations.');
      Alert.alert('Private space temporarily closed', 'This host is not accepting new reservations right now.');
      return;
    }
    if (!bookingDate || !startTime || !endTime) {
      setReservationError('Choose an available date, start time, and end time before confirming.');
      Alert.alert('Select your visit time', 'Choose an available date, start time, and end time.');
      return;
    }
    if (endTime.getTime() - startTime.getTime() < 3_600_000) {
      setReservationError('Reservations must be at least one full hour.');
      Alert.alert('One-hour minimum', 'Reservations must be at least one full hour.');
      return;
    }
    if (subscriptionDurationUnsupported && selectedLoyaltyPassOffer) {
      const message = `${selectedLoyaltyPassOffer.name} includes ${selectedLoyaltyPassOffer.credit_count} credit hours. Choose a shorter visit or select Pay regular rate.`;
      setReservationError(message);
      Alert.alert('Choose a different rate', message);
      return;
    }

    try {
      setIsBooking(true);
      const { data, error } = await supabase.functions.invoke('create-booking-checkout', {
        body: {
          propertyId: property.id,
          startAt: startTime.toISOString(),
          endAt: endTime.toISOString(),
          dogProfileIds: selectedDogIds,
          courtesyVisitCreditId: selectedCourtesyCreditId,
          resolutionDiscountOfferId: selectedResolutionDiscountOfferId,
          loyaltyPassOfferId: selectedLoyaltyPassOfferId,
        },
      });
      if (error) {
        const functionError = error as Error & { context?: Response };
        let serviceMessage: string | null = null;
        if (functionError.context) {
          try {
            const errorBody = await functionError.context.clone().json() as { error?: string };
            serviceMessage = typeof errorBody.error === 'string' ? errorBody.error : null;
          } catch {
            // Use the safely available SDK error message below.
          }
        }
        if ((serviceMessage ?? error.message).includes('conflicting') || (serviceMessage ?? error.message).includes('reserved')) {
          await loadListing();
          setStartTime(null);
          setEndTime(null);
          Alert.alert('That time was just reserved', 'The calendar has been refreshed. Please choose another available time.');
          return;
        }
        if (!serviceMessage && /failed to send a request|fetch/i.test(error.message)) {
          throw new Error('We could not reach the secure reservation service. Please check your connection and try again.');
        }
        if ((serviceMessage ?? error.message).toLowerCase().includes('liability waiver')) {
          const returnTo = encodeURIComponent(`/property/${property.id}`);
          // Alerts are not consistently visible in the web build. Navigate
          // directly so a failed checkout never looks like a dead button.
          setReservationError('Please accept the current ROVAH Terms and Liability Waiver before reserving this private space.');
          router.push(`/legal-acceptance?returnTo=${returnTo}` as never);
          return;
        }
        throw new Error(serviceMessage ?? error.message);
      }
      if (!data?.bookingId) throw new Error('The reservation could not be created. Please try again.');
      if (data.reservationConfirmed) {
        void supabase.functions
          .invoke('notify-app-email', {
            body: { type: 'reservation_created', resourceId: data.bookingId },
          })
          .then(({ error }) => {
            if (error) console.warn('Reservation notification email was not sent:', error.message);
          })
          .catch((error) => console.warn('Reservation notification email was not sent:', error));
        setSelectedCourtesyCreditId(null);
        setSelectedLoyaltyPassOfferId(null);
        Alert.alert(
          data.confirmationType === 'loyalty_pass' ? 'Reservation confirmed' : 'Courtesy Waiver confirmed',
          data.confirmationType === 'loyalty_pass'
            ? 'Your subscription credits covered this visit. No payment was needed, and the visit is now in My Reservations.'
            : 'Your $0.00 Courtesy Waiver is confirmed. No payment was needed, and the visit is now in My Reservations.',
          [{ text: 'View My Reservations', onPress: () => router.replace('/reservations') }]
        );
        return;
      }
      if (!data.checkoutUrl) throw new Error('Secure checkout could not be opened. Please try again.');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(data.checkoutUrl);
        return;
      }
      await WebBrowser.openBrowserAsync(data.checkoutUrl);
      router.replace('/reservations');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      setReservationError(message);
      Alert.alert('Unable to reserve this time', message);
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
  const mapAddress = [property.site_address, property.city, property.state, property.postal_code].filter(Boolean).join(', ');
  const shareThisSite = async () => {
    const siteUrl = `https://k9-country.expo.app/property/${property.id}`;
    const shareTitle = `${property.name} | ROVAH`;
    const shareMessage = `Visit ${property.name}, a private ROVAH dog space in ${property.city}, ${property.state}: ${siteUrl}`;

    if (process.env.EXPO_OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: shareTitle, text: shareMessage, url: siteUrl });
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareMessage);
        Alert.alert('Share link copied', 'Paste it into Facebook, a text message, email, or any other social app.');
        return;
      }

      Alert.alert('Copy this site link', siteUrl);
      return;
    }

    await Share.share(
      { message: shareMessage, title: shareTitle },
      { dialogTitle: 'Share this site' }
    );
  };

  const toggleFollow = async () => {
    if (!isMember || !session?.user.id) {
      Alert.alert('Sign in to follow sites', 'Create or sign in to a member account to follow this private space.');
      return;
    }
    try {
      setIsFollowSaving(true);
      const { error } = isFollowing
        ? await supabase.from('property_follows').delete().eq('property_id', property.id).eq('member_id', session.user.id)
        : await supabase.from('property_follows').insert({ property_id: property.id, member_id: session.user.id });
      if (error) throw error;
      setIsFollowing((current) => !current);
    } catch (error) {
      Alert.alert('Unable to update follow', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsFollowSaving(false);
    }
  };
  const siteRating = hostReviews.length > 0
    ? hostReviews.reduce((total, review) => total + review.bone_rating, 0) / hostReviews.length
    : null;
  const slotOptions = slotPicker === 'start' ? startSlotOptions : endSlotOptions;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {coverImage?.signed_url ? <Image source={{ uri: coverImage.signed_url }} style={styles.coverImage} /> : <View style={styles.coverPlaceholder}><Text style={styles.coverPlaceholderText}>Property photo</Text></View>}
        {images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>{images.map((image, index) => image.signed_url ? <Pressable accessibilityLabel={`Show property photo ${index + 1}`} accessibilityRole="button" key={image.id} onPress={() => setSelectedImageId(image.id)} style={[styles.thumbnailButton, image.id === coverImage?.id && styles.thumbnailButtonSelected]}><Image source={{ uri: image.signed_url }} style={styles.thumbnail} /></Pressable> : null)}</ScrollView> : null}
        <Text style={styles.title}>{property.name}</Text><Text style={styles.location}>{location}</Text>
        <View style={styles.listingSummary}>
          <ListingSummaryRow label="Guest Rating" value={siteRating === null ? 'No guest ratings yet' : `★ ${siteRating.toFixed(1)} / 5`} />
          <Pressable accessibilityLabel="View site reviews" accessibilityRole="button" onPress={() => setShowReviews(true)} style={styles.listingSummaryRow}>
            <Text style={styles.listingSummaryLabel}>View Reviews</Text>
            <Text style={styles.listingSummaryLink}>Open reviews ›</Text>
          </Pressable>
          <ListingSummaryRow label="Completed Reservations" value={completedReservationCount === null ? 'Loading…' : String(completedReservationCount)} />
          <ListingSummaryRow label="Hourly Rate" value={`$${Number(property.price_per_hour).toFixed(0)} per hour`} last />
        </View>
        <Text style={styles.description}>{property.short_description}</Text>

        {property.is_published ? (
          <Pressable
            accessibilityLabel={`Share ${property.name}`}
            accessibilityRole="button"
            onPress={() => void shareThisSite()}
            style={styles.shareButton}
          >
            <Text style={styles.shareButtonText}>Share this site</Text>
            <View pointerEvents="none" style={styles.shareButtonIcon}>
              <View style={[styles.shareIconLine, styles.shareIconLineTop]} />
              <View style={[styles.shareIconLine, styles.shareIconLineBottom]} />
              <View style={[styles.shareIconDot, styles.shareIconDotOrigin]} />
              <View style={[styles.shareIconDot, styles.shareIconDotTop]} />
              <View style={[styles.shareIconDot, styles.shareIconDotBottom]} />
            </View>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityLabel={isFollowing ? `Unfollow ${property.name}` : `Follow ${property.name}`}
          accessibilityRole="button"
          disabled={isFollowSaving}
          onPress={() => void toggleFollow()}
          style={[styles.followButton, isFollowing && styles.followButtonActive]}
        >
          {isFollowSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.followButtonText}>{isFollowing ? 'Following this site' : 'Follow this site'}</Text>}
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

        <Section title="Site Details"><InfoRow label="Parking" value={details.parking_instructions || 'Details will be provided before booking.'} /><InfoRow label="Gate access" value={details.gate_access_instructions || 'Details will be provided before booking.'} /><InfoRow label="Arrival" value={details.arrival_instructions || 'Details will be provided before booking.'} /><InfoRow label="Property rules" value={details.property_rules || 'No additional rules have been listed.'} last /></Section>
        <Modal animationType="slide" onRequestClose={() => setShowReviews(false)} transparent visible={showReviews}><View style={styles.reviewModalBackdrop}><View style={styles.reviewModal}><Text style={styles.reviewerName}>Site reviews</Text>{hostReviews.length > 0 ? hostReviews.map((review) => <Pressable accessibilityRole="button" key={review.id} onPress={() => { setShowReviews(false); setSelectedReview(review); }} style={{ backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 10, padding: 14 }}><Text style={styles.reviewerName}>{formatSafeReviewerName(reviewerNames[review.reviewer_id])}</Text><Text style={styles.hostReviewDate}>{formatReviewDate(review.created_at)} · ★ {review.bone_rating.toFixed(1)}</Text></Pressable>) : <Text style={styles.emptyText}>No public site reviews have been shared yet.</Text>}<Pressable onPress={() => setShowReviews(false)} style={styles.closeReviewButton}><Text style={styles.closeReviewText}>Close</Text></Pressable></View></View></Modal>
        <Modal animationType="slide" onRequestClose={() => setSelectedReview(null)} transparent visible={selectedReview !== null}><View style={styles.reviewModalBackdrop}><View style={styles.reviewModal}><Text style={styles.reviewerName}>{selectedReview ? formatSafeReviewerName(reviewerNames[selectedReview.reviewer_id]) : ''}</Text><Text style={styles.hostReviewDate}>{selectedReview ? `★ ${selectedReview.bone_rating.toFixed(1)} · ${formatReviewDate(selectedReview.created_at)}` : ''}</Text>{selectedReview ? <ReviewAnswers review={selectedReview} /> : null}<Text style={styles.fullReviewText}>{selectedReview?.review_text || 'No additional comments shared.'}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{(selectedReview?.photo_urls ?? []).map((uri) => <Image key={uri} source={{ uri }} style={{ borderRadius: 10, height: 100, width: 100 }} />)}</View><Pressable onPress={() => setSelectedReview(null)} style={styles.closeReviewButton}><Text style={styles.closeReviewText}>Close</Text></Pressable></View></View></Modal>
        <Section title="Amenities">{amenities.length > 0 ? <View style={styles.amenityGrid}>{amenities.map((amenity) => <View key={amenity} style={styles.amenityPill}><Text style={styles.amenityText}>{amenityLabels[amenity] ?? amenity}</Text></View>)}</View> : <Text style={styles.emptyText}>No amenities have been listed yet.</Text>}</Section>
        <View style={[styles.mapSection, { marginBottom: 5 }]}>
          <GooglePropertyMap address={mapAddress} dom={{ scrollEnabled: false, style: styles.embeddedMap }} />
        </View>
        <View style={styles.bookingCard}>
          <Text style={styles.bookingEyebrow}>START YOUR BOOKING</Text><Text style={styles.bookingTitle}>Reserve this private space</Text><Text style={styles.bookingText}>Green dates have at least one available one-hour visit. Red dates are closed or fully booked.</Text>
          {needsGuestProfile ? <Pressable accessibilityRole="button" onPress={() => router.push(`/profile?returnTo=/property/${property.id}` as never)} style={styles.profileRequiredCard}><Text style={styles.profileRequiredTitle}>Complete your guest profile before reserving</Text><Text style={styles.profileRequiredText}>Add your private contact and dog details once, then return here to finish this reservation.</Text><Text style={styles.profileRequiredLink}>Complete guest profile →</Text></Pressable> : null}
          {property.is_temporarily_closed ? <Text style={styles.temporarilyClosedText}>This private space is temporarily closed and is not accepting new reservations.</Text> : null}
          {loyaltyPassOffers.length > 0 ? <View style={styles.loyaltyPassSection}>
            <Text style={styles.loyaltyPassEyebrow}>{memberLoyaltyPasses.length ? 'YOUR ACTIVE SUBSCRIPTION' : 'OPTIONAL SUBSCRIPTION'}</Text>
            <Text style={styles.loyaltyPassTitle}>Make this your regular spot</Text>
            <Text style={styles.loyaltyPassIntro}>{selectedPassHasEnoughCredits ? 'Your available subscription credits are selected for this visit. You can switch to the regular rate below if you prefer.' : memberLoyaltyPasses.length ? 'Choose your available subscription credits or the regular rate for this visit.' : 'This host offers discounted prepaid visit credits for guests who want to come back again.'}</Text>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedLoyaltyPassOfferId === null }}
              onPress={() => { setHasChosenReservationRate(true); setSelectedLoyaltyPassOfferId(null); }}
              style={[styles.loyaltyPassOffer, selectedLoyaltyPassOfferId === null && styles.loyaltyPassOfferSelected]}
            >
              <View style={styles.loyaltyPassOfferHeader}>
                <Text style={styles.loyaltyPassOfferName}>Pay regular rate</Text>
                <View style={[styles.loyaltyPassRadio, selectedLoyaltyPassOfferId === null && styles.loyaltyPassRadioSelected]}>
                  {selectedLoyaltyPassOfferId === null ? <Text style={styles.loyaltyPassRadioCheck}>✓</Text> : null}
                </View>
              </View>
              <Text style={styles.loyaltyPassDetails}>Reserve this visit at ${Number(property.price_per_hour).toFixed(2)} per hour.</Text>
            </Pressable>
            {loyaltyPassOffers.map((offer) => {
              const oneDogValue = offer.credit_count * Number(property.price_per_hour);
              const discountPercent = oneDogValue > 0 ? Math.round((1 - Number(offer.package_price) / oneDogValue) * 100) : 0;
              const coveredDogCount = Math.max(1, dogCount);
              const normalValue = offer.credit_count * (Number(property.price_per_hour) + (coveredDogCount - 1) * additionalDogRate);
              const packagePrice = normalValue * (1 - discountPercent / 100);
              const savings = normalValue - packagePrice;
              const selected = selectedLoyaltyPassOfferId === offer.id;
              const ownedPass = memberLoyaltyPasses.find((pass) => pass.loyalty_pass_offer_id === offer.id && pass.covered_dog_count >= coveredDogCount);
              const enoughCredits = Boolean(ownedPass && Number(ownedPass.credit_hours_remaining) >= visitHours);
              return <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={offer.id}
                onPress={() => {
                  setHasChosenReservationRate(true);
                  setSelectedLoyaltyPassOfferId(selected ? null : offer.id);
                  if (!selected) {
                    setSelectedCourtesyCreditId(null);
                    setSelectedResolutionDiscountOfferId(null);
                  }
                }}
                style={[styles.loyaltyPassOffer, selected && styles.loyaltyPassOfferSelected]}
              >
                <View style={styles.loyaltyPassOfferHeader}>
                  <Text style={styles.loyaltyPassOfferName}>{offer.name}</Text>
                  <View style={styles.loyaltyPassOfferBadge}>
                    <Text style={styles.loyaltyPassSavings}>{Math.max(0, discountPercent)}% off</Text>
                    <View style={[styles.loyaltyPassRadio, selected && styles.loyaltyPassRadioSelected]}>{selected ? <Text style={styles.loyaltyPassRadioCheck}>✓</Text> : null}</View>
                  </View>
                </View>
                <Text style={styles.loyaltyPassOriginalCost}>Original cost: ${normalValue.toFixed(2)}</Text>
                <Text style={styles.loyaltyPassPrice}>{enoughCredits ? 'Use your available credits — all selected dogs included' : `Subscription price: $${packagePrice.toFixed(2)}`}</Text>
                <Text style={styles.loyaltyPassDetails}>You save ${Math.max(0, savings).toFixed(2)} · Covers {coveredDogCount} {coveredDogCount === 1 ? 'dog' : 'dogs'} on every included visit · {offer.credit_count} one-hour visit credits · Valid for {offer.duration_months} {offer.duration_months === 1 ? 'month' : 'months'}</Text>
                {ownedPass ? <Text style={styles.loyaltyPassDetails}>Your available balance: {Number(ownedPass.credit_hours_remaining)} credit {Number(ownedPass.credit_hours_remaining) === 1 ? 'hour' : 'hours'} for up to {ownedPass.covered_dog_count} {ownedPass.covered_dog_count === 1 ? 'dog' : 'dogs'} per visit.</Text> : null}
                {selected && subscriptionDurationUnsupported ? <Text style={styles.subscriptionWarning}>This visit is longer than this subscription. Choose a shorter visit or Pay regular rate.</Text> : null}
              </Pressable>;
            })}
            <Text style={styles.loyaltyPassNote}>Choose one rate only. Each subscription credit covers one hour, so a two-hour visit uses two credits. Credits are valid through 10:00 p.m. on the final valid day in this site’s local time zone. Your selected subscription or regular rate will be shown in the total and used at checkout.</Text>
          </View> : null}
          <View style={styles.calendarHeader}><Pressable accessibilityLabel="Previous month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable><Text style={styles.monthTitle}>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</Text><Pressable accessibilityLabel="Next month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable></View>
          <View style={styles.weekdayRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekdayLabel}>{day}</Text>)}</View>
          <View style={styles.calendarGrid}>{calendarDates.map((date) => {
            const inCurrentMonth = date.getMonth() === calendarMonth.getMonth();
            const available = inCurrentMonth && getStartSlotOptions(date).some((slot) => slot.isAvailable);
            const selected = bookingDate && dateKey(date) === dateKey(bookingDate);
            return <Pressable key={dateKey(date)} disabled={!available} onPress={() => chooseDate(date)} style={[styles.calendarDay, available ? styles.calendarDayAvailable : styles.calendarDayUnavailable, selected && styles.calendarDaySelected, !inCurrentMonth && styles.calendarDayOutsideMonth]}><Text style={[styles.calendarDayText, !available && styles.calendarDayTextUnavailable, selected && styles.calendarDayTextSelected]}>{date.getDate()}</Text></Pressable>;
          })}</View>
          <Text style={styles.selectedDateText}>{formatSelectedDate(bookingDate)}</Text>
          <Text style={styles.fieldLabel}>Start time</Text>
          <Pressable disabled={!bookingDate || availableStartSlots.length === 0} onPress={() => setSlotPicker('start')} style={[styles.selectorButton, (!bookingDate || availableStartSlots.length === 0) && styles.selectorDisabled]}><Text style={styles.selectorButtonText}>{startTime ? formatMilitaryTime(startTime) : 'Select start time'}</Text><Text style={styles.selectorHint}>⌄</Text></Pressable>
          <Text style={styles.fieldLabel}>End time</Text>
          <Pressable disabled={!startTime || availableEndSlots.length === 0} onPress={() => setSlotPicker('end')} style={[styles.selectorButton, (!startTime || availableEndSlots.length === 0) && styles.selectorDisabled]}><Text style={styles.selectorButtonText}>{endTime ? formatMilitaryTime(endTime) : 'Select end time'}</Text><Text style={styles.selectorHint}>⌄</Text></Pressable>
          <Text style={styles.minimumText}>One-hour minimum; times are offered only on the hour and half hour.</Text>
          <Text style={styles.minimumText}>All reservation times use this site’s local time: {propertyTimeZoneLabel(property.time_zone)}.</Text>
          <Text style={styles.fieldLabel}>Select attending dogs</Text>
          <Text style={styles.attendingDogsIntro}>Choose every dog coming to this visit. Your host will receive each selected dog’s name, breed, size, and behavior traits.</Text>
          {isDogProfilesLoading ? <View style={styles.dogProfileLoading}><ActivityIndicator color={colors.forest} /></View> : null}
          {!isDogProfilesLoading && dogProfiles.length === 0 ? <Pressable accessibilityRole="button" onPress={() => router.push('/dog-profiles' as never)} style={styles.addDogProfileCard}><Text style={styles.addDogProfileTitle}>Add a Dog Profile</Text><Text style={styles.addDogProfileText}>Create a dog profile before making this reservation.</Text></Pressable> : null}
          {!isDogProfilesLoading && dogProfiles.length ? <View style={styles.attendingDogList}>{dogProfiles.map((dog) => {
            const isSelected = selectedDogIds.includes(dog.id);
            return <Pressable key={dog.id} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} onPress={() => setSelectedDogIds((current) => isSelected ? current.filter((id) => id !== dog.id) : [...current, dog.id])} style={[styles.attendingDogOption, isSelected && styles.attendingDogOptionSelected]}><View style={styles.attendingDogCheck}><Text style={styles.attendingDogCheckText}>{isSelected ? '✓' : ''}</Text></View><View style={styles.attendingDogCopy}><Text style={styles.attendingDogName}>{dog.name}</Text><Text style={styles.attendingDogDetails}>{[dog.breed, dog.size].filter(Boolean).join(' · ') || 'Dog details'}</Text></View></Pressable>;
          })}</View> : null}
          <Text style={styles.dogFeeText}>{selectedLoyaltyPassOffer ? `${Math.max(1, dogCount)} ${Math.max(1, dogCount) === 1 ? 'dog is' : 'dogs are'} included in this subscription price. There is no extra-dog charge on included subscription visits.` : `${dogCount ? `${dogCount} ${dogCount === 1 ? 'dog is' : 'dogs are'} attending. ` : ''}Each additional dog is ${additionalDogRate.toFixed(2)} per hour (50% of the base hourly fee).`}</Text>
          {courtesyVisitCredits.length ? <View style={styles.courtesyVisitCard}><Text style={styles.courtesyVisitText}>A Courtesy Waiver covers exactly one hour for all of your selected dogs.</Text>{courtesyVisitCredits.map((credit) => { const selected = selectedCourtesyCreditId === credit.id; return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={credit.id} onPress={() => { setSelectedCourtesyCreditId(selected ? null : credit.id); if (!selected) { setSelectedResolutionDiscountOfferId(null); setSelectedLoyaltyPassOfferId(null); } }} style={[styles.courtesyVisitOption, selected && styles.courtesyVisitOptionSelected]}><Text style={styles.courtesyVisitTitle}>Courtesy Waiver from {property.name}</Text><Text style={styles.courtesyVisitText}>Use by {new Date(credit.expires_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · all selected dogs included</Text></Pressable>; })}{courtesyVisitRequiresOneHour ? <Text style={styles.courtesyVisitUnavailable}>Choose an exactly one-hour visit to use this Courtesy Waiver.</Text> : null}</View> : null}
          {resolutionDiscountOffers.length ? <View style={styles.resolutionDiscountCard}><Text style={styles.resolutionDiscountTitle}>Special Discount available</Text><Text style={styles.resolutionDiscountText}>Your host has offered a one-time discount for this private space.</Text>{resolutionDiscountOffers.map((offer) => { const selected = selectedResolutionDiscountOfferId === offer.id; return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={offer.id} onPress={() => { setSelectedResolutionDiscountOfferId(selected ? null : offer.id); if (!selected) setSelectedCourtesyCreditId(null); }} style={[styles.resolutionDiscountOption, selected && styles.resolutionDiscountOptionSelected]}><Text style={styles.resolutionDiscountOptionTitle}>{Number(offer.discount_percent)}% off · expires {new Date(`${offer.expires_at}T12:00:00`).toLocaleDateString()}</Text>{offer.note ? <Text style={styles.resolutionDiscountOptionText}>{offer.note}</Text> : null}</Pressable>; })}</View> : null}
          <View style={styles.estimateRow}><Text style={styles.estimateLabel}>{selectedCourtesyCreditId ? 'Courtesy Waiver total' : selectedLoyaltyPassOffer ? selectedPassHasEnoughCredits ? 'Subscription Reservation — included' : 'Subscription Reservation total' : selectedResolutionDiscount ? 'Special Discount total' : 'Rental Fee'}</Text><View style={styles.estimateAmounts}>{selectedResolutionDiscount && !selectedCourtesyCreditId && !selectedLoyaltyPassOffer ? <Text style={styles.estimateOriginalValue}>${estimatedTotal.toFixed(2)}</Text> : null}<Text style={styles.estimateValue}>{`$${reservationTotal.toFixed(2)}`}</Text></View></View>
          {reservationError ? <View accessibilityRole="alert" style={styles.reservationError}><Text style={styles.reservationErrorText}>{reservationError}</Text></View> : null}
            <Pressable disabled={property.is_temporarily_closed || isBooking || isDogProfilesLoading || subscriptionDurationUnsupported || courtesyVisitRequiresOneHour} onPress={reserveSpace} style={[styles.bookingButton, (property.is_temporarily_closed || isBooking || isDogProfilesLoading || subscriptionDurationUnsupported || courtesyVisitRequiresOneHour) && styles.buttonDisabled]}>{isBooking ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.bookingButtonText}>{courtesyVisitRequiresOneHour ? 'Choose a one-hour visit to continue' : !bookingDate ? 'Choose a date to continue' : !startTime ? 'Choose a start time to continue' : !endTime ? 'Choose an end time to continue' : !selectedDogIds.length ? 'Select attending dogs to continue' : selectedLoyaltyPassOffer && !selectedPassHasEnoughCredits ? 'Buy Subscription & Confirm' : 'Confirm Reservation'}</Text>}</Pressable>
          {!selectedCourtesyCreditId && reservationTotal > 0 ? <Text style={styles.paymentConsentText}>{selectedLoyaltyPassOffer ? 'By confirming, you authorize ROVAH to charge the full displayed subscription price now. It includes every dog selected above, and the credits are available after payment succeeds. Subscription purchases are not refundable.' : 'For a standard-rate visit, ROVAH collects payment one hour before the visit begins. Cancel in My Reservations before that cutoff: ROVAH records the cancellation, no charge is collected, and no refund is needed.'}</Text> : null}
          <HostPageGuide
            title="How to reserve this private space"
            intro="Review the site, choose an available time, select your dogs, and confirm the reservation."
            tone="forest"
            steps={[
              { title: 'Review the site', text: 'Check the details, amenities, rules, arrival information, photos, and map before booking.' },
              { title: 'Choose an available time', text: 'Select a green date, then an available start and end time. Pink times cannot be booked.' },
              { title: 'Select attending dogs', text: 'Choose every dog coming. The host receives the visit details needed to prepare.' },
              { title: 'Choose your rate', text: 'Pick regular hourly pricing or one subscription. A Courtesy Waiver or Special Discount may be used instead, but offers do not stack.' },
              { title: 'Know the cancellation window', text: 'For a regular-rate visit, cancel in My Reservations more than one hour before it starts. ROVAH records the cancellation before payment is collected, so there is no charge or refund.' },
              { title: 'Confirm and check My Reservations', text: 'After confirmation, open My Reservations to review the visit or message the host.' },
            ]}
          />
        </View>
      </ScrollView>

      <Modal animationType="slide" transparent visible={slotPicker !== null} onRequestClose={() => setSlotPicker(null)}>
        <Pressable onPress={() => setSlotPicker(null)} style={styles.modalBackdrop}>
          <Pressable onPress={() => undefined} style={styles.slotSheet}>
            <Text style={styles.slotSheetTitle}>{slotPicker === 'start' ? 'Choose a start time' : 'Choose an end time'}</Text>
            <Text style={styles.slotSheetText}>Available times are selectable. Pink times are unavailable.</Text>
            <ScrollView contentContainerStyle={styles.slotList}>{slotOptions.map((slot) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: !slot.isAvailable }} disabled={!slot.isAvailable} key={slot.time.toISOString()} onPress={() => slotPicker === 'start' ? chooseStartTime(slot.time) : chooseEndTime(slot.time)} style={[styles.slotButton, !slot.isAvailable && styles.slotButtonUnavailable]}><Text style={[styles.slotButtonText, !slot.isAvailable && styles.slotButtonTextUnavailable]}>{formatMilitaryTime(slot.time)}</Text></Pressable>)}</ScrollView>
            <Pressable onPress={() => setSlotPicker(null)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ReviewAnswers({ review }: { review: BookingReview }) {
  const answer = (value: 'yes' | 'no' | 'not_sure' | null) => value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not answered';
  return <View style={{ gap: 7, marginTop: 16 }}>
    <Text style={styles.hostReviewDate}>Clean and well maintained: {answer(review.cleanliness)}</Text>
    {review.property_matches_listing ? <Text style={styles.hostReviewDate}>Matched the listing and photos: {answer(review.property_matches_listing)}</Text> : null}
    <Text style={styles.hostReviewDate}>Safe and secure for a dog: {answer(review.fence_security)}</Text>
    {review.would_book_again ? <Text style={styles.hostReviewDate}>Would book again: {answer(review.would_book_again)}</Text> : null}
  </View>;
}

function formatSafeReviewerName(displayName?: string) {
  const nameParts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return 'Guest';
  if (nameParts.length === 1) return nameParts[0];
  return `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0).toUpperCase()}.`;
}

function formatReviewDate(value: string) {
  return `Reviewed ${new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={[styles.section, { marginBottom: 5 }]}><Text style={[styles.sectionTitle, memberUi.cardTitle]}>{title}</Text>{children}</View>; }
function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.infoRow, !last && styles.infoRowDivider]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
function ListingSummaryRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) { return <View style={[styles.listingSummaryRow, !last && styles.listingSummaryRowDivider]}><Text style={styles.listingSummaryLabel}>{label}</Text><Text style={styles.listingSummaryValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  followButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginBottom: 10, minHeight: 52 }, followButtonActive: { backgroundColor: colors.olive }, followButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 42 }, centeredState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 }, stateTitle: { color: colors.forest, fontSize: 24, fontWeight: '900', textAlign: 'center' }, stateText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: 'center' }, backToSearchButton: { backgroundColor: colors.forest, borderRadius: 13, marginTop: 22, minHeight: 50, paddingHorizontal: 20, justifyContent: 'center' }, backToSearchText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' }, backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 12 }, backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '900' }, coverImage: { borderRadius: 20, height: 260, width: '100%' }, coverPlaceholder: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 20, height: 260, justifyContent: 'center' }, coverPlaceholderText: { color: colors.muted, fontSize: 15, fontWeight: '800' }, photoStrip: { gap: 10, marginTop: 10 }, thumbnailButton: { borderColor: 'transparent', borderRadius: 12, borderWidth: 3, overflow: 'hidden' }, thumbnailButtonSelected: { borderColor: colors.forest }, thumbnail: { height: 70, width: 92 }, eyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginTop: 22 }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 6 }, location: { color: colors.muted, fontSize: 16, marginTop: 5 }, listingSummary: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 16, paddingHorizontal: 14 }, listingSummaryRow: { paddingVertical: 12 }, listingSummaryRowDivider: { borderBottomColor: colors.border, borderBottomWidth: 1 }, listingSummaryLabel: { color: colors.forest, fontSize: 13, fontWeight: '900' }, listingSummaryValue: { color: colors.muted, fontSize: 15, fontWeight: '800', marginTop: 4 }, listingSummaryLink: { color: colors.brown, fontSize: 15, fontWeight: '900', marginTop: 4, textDecorationLine: 'underline' }, description: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: 14, marginTop: 14 }, shareButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.brown, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginBottom: 10, minHeight: 52 }, shareButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' }, shareButtonIcon: { height: 22, marginLeft: 10, position: 'relative', width: 22 }, shareIconLine: { backgroundColor: colors.brown, height: 2, left: 5, position: 'absolute', width: 13 }, shareIconLineTop: { top: 7, transform: [{ rotate: '-27deg' }] }, shareIconLineBottom: { top: 14, transform: [{ rotate: '27deg' }] }, shareIconDot: { backgroundColor: colors.brown, borderRadius: 4, height: 7, position: 'absolute', width: 7 }, shareIconDotOrigin: { left: 0, top: 8 }, shareIconDotTop: { right: 0, top: 1 }, shareIconDotBottom: { bottom: 1, right: 0 }, messageHostButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.brown, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginBottom: 22, minHeight: 52 }, messageHostButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' }, messageHostButtonIcon: { fontSize: 18, marginLeft: 8 }, section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 14, padding: 17 }, sectionTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 12 }, infoRow: { paddingVertical: 11 }, infoRowDivider: { borderBottomColor: colors.border, borderBottomWidth: 1 }, infoLabel: { color: colors.forest, fontSize: 14, fontWeight: '900' }, infoValue: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, amenityPill: { backgroundColor: colors.lightGreen, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }, amenityText: { color: colors.olive, fontSize: 13, fontWeight: '800' }, mapSection: { backgroundColor: '#E6EDE2', borderColor: '#C4D2B6', borderRadius: 18, borderWidth: 1, marginBottom: 14, overflow: 'hidden' }, embeddedMap: { height: 220, width: '100%' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21 }, rulesText: { color: colors.muted, fontSize: 15, lineHeight: 23 }, reviewIntro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 }, hostReview: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 12, paddingTop: 12 }, hostReviewBones: { fontSize: 20, letterSpacing: 1 }, emptyBones: { opacity: 0.18 }, hostReviewDate: { color: colors.brown, fontSize: 12, fontWeight: '800', marginTop: 7 }, hostReviewText: { color: colors.forest, fontSize: 14, lineHeight: 21, marginTop: 6 }, hostReviewEmpty: { color: colors.muted, fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  bookingCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 20, borderWidth: 1, marginTop: 6, padding: 18 }, bookingEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, bookingTitle: { color: colors.forest, fontSize: 22, fontWeight: '900', marginTop: 6 }, bookingText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 18, marginTop: 7 }, profileRequiredCard: { backgroundColor: colors.warmWhite, borderColor: colors.brown, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 14 }, profileRequiredTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' }, profileRequiredText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }, profileRequiredLink: { color: colors.brown, fontSize: 14, fontWeight: '900', marginTop: 10, textDecorationLine: 'underline' }, calendarHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, monthButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 }, monthButtonText: { color: colors.forest, fontSize: 27, fontWeight: '700', lineHeight: 30 }, monthTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' }, weekdayRow: { flexDirection: 'row', marginBottom: 5 }, weekdayLabel: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '900', textAlign: 'center' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 }, calendarDay: { alignItems: 'center', borderRadius: 16, height: 34, justifyContent: 'center', width: '13.2%' }, calendarDayAvailable: { backgroundColor: '#BFD8B9' }, calendarDayUnavailable: { backgroundColor: '#F0C5C0' }, calendarDaySelected: { backgroundColor: colors.forest, borderColor: colors.warmWhite, borderWidth: 2 }, calendarDayOutsideMonth: { opacity: 0.35 }, calendarDayText: { color: colors.forest, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900' }, calendarDayTextUnavailable: { color: '#95423A' }, calendarDayTextSelected: { color: colors.warmWhite }, selectedDateText: { color: colors.forest, fontSize: 14, fontWeight: '900', marginTop: 14, textAlign: 'center' }, fieldLabel: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: 7, marginTop: 14 }, selectorButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 14 }, selectorDisabled: { backgroundColor: '#ECE6D9', opacity: 0.7 }, selectorButtonText: { color: colors.forest, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' }, selectorHint: { color: colors.brown, fontSize: 20, fontWeight: '900' }, minimumText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 }, attendingDogsIntro: { color: colors.muted, fontSize: 13, lineHeight: 19 }, dogProfileLoading: { alignItems: 'center', minHeight: 52, justifyContent: 'center' }, attendingDogList: { gap: 8, marginTop: 11 }, attendingDogOption: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', minHeight: 58, padding: 10 }, attendingDogOptionSelected: { backgroundColor: '#E7F0E3', borderColor: colors.forest, borderWidth: 2 }, attendingDogCheck: { alignItems: 'center', borderColor: colors.brown, borderRadius: 12, borderWidth: 1, height: 24, justifyContent: 'center', marginRight: 10, width: 24 }, attendingDogCheckText: { color: colors.forest, fontSize: 15, fontWeight: '900' }, attendingDogCopy: { flex: 1 }, attendingDogName: { color: colors.forest, fontSize: 15, fontWeight: '900' }, attendingDogDetails: { color: colors.muted, fontSize: 13, marginTop: 2 }, addDogProfileCard: { backgroundColor: colors.warmWhite, borderColor: colors.brown, borderRadius: 13, borderWidth: 1, marginTop: 10, padding: 13 }, addDogProfileTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' }, addDogProfileText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }, dogFeeText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' }, estimateRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }, estimateLabel: { color: colors.muted, fontSize: 14, fontWeight: '800' }, estimateValue: { color: colors.forest, fontSize: 21, fontWeight: '900' }, bookingButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 54 }, bookingButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, buttonDisabled: { opacity: 0.55 },
  courtesyVisitCard: { backgroundColor: colors.warmWhite, borderColor: '#91B58D', borderRadius: 14, borderWidth: 1, marginTop: 15, padding: 12 }, courtesyVisitTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' }, courtesyVisitText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }, courtesyVisitLimit: { color: colors.brown, fontSize: 12, fontWeight: '800', lineHeight: 18, marginTop: 8 }, courtesyVisitOption: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, marginTop: 10, padding: 10 }, courtesyVisitOptionSelected: { backgroundColor: colors.lightGreen, borderColor: colors.forest, borderWidth: 2 }, courtesyVisitOptionTitle: { color: colors.forest, fontSize: 13, fontWeight: '900' }, courtesyVisitOptionText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, courtesyVisitStatus: { color: colors.muted, fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginTop: 10 }, courtesyVisitUnavailable: { backgroundColor: '#FFF3D6', borderColor: '#D5B071', borderRadius: 10, borderWidth: 1, color: colors.brown, fontSize: 12, fontWeight: '800', lineHeight: 18, marginTop: 10, padding: 10 }, reservationError: { backgroundColor: '#FFF1EE', borderColor: '#B85F52', borderRadius: 12, borderWidth: 1, marginTop: 14, padding: 12 }, reservationErrorText: { color: '#8C3A31', fontSize: 13, fontWeight: '700', lineHeight: 19 }, paymentConsentText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  resolutionDiscountCard: { backgroundColor: colors.warmWhite, borderColor: '#D5B071', borderRadius: 14, borderWidth: 1, marginTop: 15, padding: 12 }, resolutionDiscountTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' }, resolutionDiscountText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }, resolutionDiscountOption: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, marginTop: 10, padding: 10 }, resolutionDiscountOptionSelected: { backgroundColor: '#FFF3D6', borderColor: colors.brown, borderWidth: 2 }, resolutionDiscountOptionTitle: { color: colors.brown, fontSize: 13, fontWeight: '900' }, resolutionDiscountOptionText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, estimateAmounts: { alignItems: 'flex-end' }, estimateOriginalValue: { color: colors.muted, fontSize: 12, fontWeight: '800', textDecorationLine: 'line-through' },
  loyaltyPassSection: { backgroundColor: colors.warmWhite, borderColor: '#B9CFAF', borderRadius: 15, borderWidth: 1, marginBottom: 18, padding: 14 },
  loyaltyPassEyebrow: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  loyaltyPassTitle: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 5 },
  loyaltyPassIntro: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  loyaltyPassOffer: { backgroundColor: colors.lightGreen, borderColor: '#B9CFAF', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 12 }, loyaltyPassOfferSelected: { backgroundColor: '#E7F0E3', borderColor: colors.forest, borderWidth: 2 },
  loyaltyPassOfferHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  loyaltyPassOfferName: { color: colors.forest, flex: 1, fontSize: 14, fontWeight: '900', paddingRight: 8 },
  loyaltyPassOfferBadge: { alignItems: 'flex-end', gap: 7 }, loyaltyPassSavings: { color: colors.olive, fontSize: 12, fontWeight: '900' }, loyaltyPassRadio: { alignItems: 'center', borderColor: colors.brown, borderRadius: 11, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 }, loyaltyPassRadioSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, loyaltyPassRadioCheck: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' },
  loyaltyPassOriginalCost: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800', marginTop: 9, textDecorationLine: 'line-through' },
  loyaltyPassPrice: { color: colors.forest, fontSize: 21, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 9 },
  loyaltyPassDetails: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  loyaltyPassNote: { color: colors.brown, fontSize: 12, fontWeight: '800', lineHeight: 18, marginTop: 12 }, subscriptionWarning: { color: '#8C3A31', fontSize: 12, fontWeight: '900', lineHeight: 18, marginTop: 8 },
  reviewerName: { color: colors.forest, fontSize: 16, fontWeight: '900' }, reviewModalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'center', padding: 24 }, reviewModal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 440, padding: 22, width: '100%' }, fullReviewText: { color: colors.forest, fontSize: 16, lineHeight: 23, marginTop: 16 }, closeReviewButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 48 }, closeReviewText: { color: colors.warmWhite, fontWeight: '900' },
  temporarilyClosedText: { backgroundColor: '#F0C5C0', borderColor: '#D88A80', borderRadius: 10, borderWidth: 1, color: '#95423A', fontSize: 13, fontWeight: '800', lineHeight: 19, marginBottom: 14, padding: 11, textAlign: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'flex-end' }, slotSheet: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%', padding: 22 }, slotSheetTitle: { color: colors.forest, fontSize: 22, fontWeight: '900' }, slotSheetText: { color: colors.muted, fontSize: 14, marginTop: 5 }, slotList: { gap: 9, paddingBottom: 12, paddingTop: 18 }, slotButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, minHeight: 48, justifyContent: 'center' }, slotButtonUnavailable: { backgroundColor: '#F0C5C0', borderColor: '#D88A80', opacity: 0.72 }, slotButtonText: { color: colors.forest, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' }, slotButtonTextUnavailable: { color: '#95423A' }, cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, cancelButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' },
});
