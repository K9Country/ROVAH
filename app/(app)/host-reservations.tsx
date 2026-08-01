import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { HostPageGuide } from '../../components/host-page-guide';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type ReservationView = 'upcoming' | 'past' | 'canceled' | 'calendar';

type HostBooking = {
  id: string;
  property_id: string;
  guest_id: string;
  member_loyalty_pass_id: string | null;
  start_at: string;
  end_at: string;
  dog_count: number;
  total_amount: number;
  status: 'confirmed' | 'cancelled';
  payment_status: 'pending_configuration' | 'processing' | 'paid' | 'refunded' | 'failed' | 'cancelled';
  properties: { name: string; city: string; state: string } | null;
};
type BookingDog = { booking_id: string; id: string; name: string; breed: string; size: string; behavior_traits: string[] };

const viewOptions: { key: ReservationView; label: string }[] = [
  { key: 'upcoming', label: 'Current' },
  { key: 'past', label: 'Past' },
  { key: 'canceled', label: 'Canceled' },
  { key: 'calendar', label: 'Calendar' },
];
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRemaining(endAt: string, currentTime: Date) {
  const totalMinutes = Math.ceil(Math.max(0, new Date(endAt).getTime() - currentTime.getTime()) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return 'Visit ending now';
}

export default function HostReservationsScreen() {
  const { propertyId, propertyName, view } = useLocalSearchParams<{
    propertyId?: string;
    propertyName?: string;
    view?: ReservationView;
  }>();
  const { session } = useAuth();
  const [activeView, setActiveView] = useState<ReservationView>(view === 'calendar' ? 'calendar' : 'upcoming');
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [bookings, setBookings] = useState<HostBooking[]>([]);
  const [bookingDogs, setBookingDogs] = useState<Record<string, BookingDog[]>>({});
  const [guestNames, setGuestNames] = useState<Record<string, string>>({});
  const [subscriptionCredits, setSubscriptionCredits] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [openingConversationForBookingId, setOpeningConversationForBookingId] = useState<string | null>(null);
  const [reservationPendingCancellation, setReservationPendingCancellation] = useState<HostBooking | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(null);
  const [courtesyBooking, setCourtesyBooking] = useState<HostBooking | null>(null);
  const [courtesyHours, setCourtesyHours] = useState('1');
  const [courtesyNote, setCourtesyNote] = useState('');
  const [isIssuingCourtesy, setIsIssuingCourtesy] = useState(false);
  const [courtesyError, setCourtesyError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadBookings = useCallback(async () => {
    if (!session?.user.id) {
      setBookings([]);
      setGuestNames({});
      setBookingDogs({});
      setSubscriptionCredits({});
      return;
    }

    setErrorMessage(null);
    let query = supabase
      .from('bookings')
      .select('id, property_id, guest_id, member_loyalty_pass_id, start_at, end_at, dog_count, total_amount, status, payment_status, properties(name, city, state)')
      .order('start_at', { ascending: true });
    if (propertyId) query = query.eq('property_id', propertyId);

    const { data, error } = await query;
    if (error) {
      setErrorMessage('We could not load reservations. Pull down to try again.');
      return;
    }

    const rows = (data ?? []).map((booking) => ({
      ...booking,
      properties: Array.isArray(booking.properties) ? booking.properties[0] ?? null : booking.properties,
    })) as HostBooking[];
    setBookings(rows);

    const subscriptionPassIds = [...new Set(rows.flatMap((booking) => booking.member_loyalty_pass_id ? [booking.member_loyalty_pass_id] : []))];
    const bookingIdsForSubscriptions = rows.map((booking) => booking.id);
    if (subscriptionPassIds.length || bookingIdsForSubscriptions.length) {
      const [passIdResult, purchaseBookingResult] = await Promise.all([
        subscriptionPassIds.length
          ? supabase.from('member_loyalty_passes').select('id, credit_hours_remaining').in('id', subscriptionPassIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('member_loyalty_passes').select('purchase_booking_id, credit_hours_remaining').in('purchase_booking_id', bookingIdsForSubscriptions),
      ]);
      if (passIdResult.error || purchaseBookingResult.error) {
        setErrorMessage('We could not load subscription balances for these reservations. Pull down to try again.');
      } else {
        const creditsByPassId = Object.fromEntries((passIdResult.data ?? []).map((pass) => [pass.id, Number(pass.credit_hours_remaining)]));
        const creditsByPurchaseBookingId = Object.fromEntries((purchaseBookingResult.data ?? []).flatMap((pass) => pass.purchase_booking_id ? [[pass.purchase_booking_id, Number(pass.credit_hours_remaining)]] : []));
        setSubscriptionCredits(Object.fromEntries(rows.flatMap((booking) => {
          const balance = booking.member_loyalty_pass_id ? creditsByPassId[booking.member_loyalty_pass_id] : creditsByPurchaseBookingId[booking.id];
          return balance === undefined ? [] : [[booking.id, balance]];
        })));
      }
    } else {
      setSubscriptionCredits({});
    }

    const bookingIds = rows.map((booking) => booking.id);
    if (bookingIds.length) {
      const { data: dogRows, error: dogError } = await supabase
        .from('booking_dogs')
        .select('id, booking_id, name, breed, size, behavior_traits')
        .in('booking_id', bookingIds);
      if (dogError) {
        setErrorMessage('We could not load the dog details for these reservations. Pull down to try again.');
      } else {
        const dogsByBooking = (dogRows ?? []).reduce<Record<string, BookingDog[]>>((result, dog) => {
          const normalizedDog = { ...dog, behavior_traits: Array.isArray(dog.behavior_traits) ? dog.behavior_traits : [] } as BookingDog;
          result[dog.booking_id] = [...(result[dog.booking_id] ?? []), normalizedDog];
          return result;
        }, {});
        setBookingDogs(dogsByBooking);
      }
    } else {
      setBookingDogs({});
    }

    const guestIds = [...new Set(rows.map((booking) => booking.guest_id))];
    if (!guestIds.length) {
      setGuestNames({});
      return;
    }
    const { data: profiles } = await supabase
      .from('messaging_profiles')
      .select('user_id, display_name')
      .in('user_id', guestIds);
    setGuestNames(Object.fromEntries((profiles ?? []).map((profile) => [profile.user_id, profile.display_name])));
  }, [propertyId, session?.user.id]);

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

  const refresh = async () => {
    try {
      setIsRefreshing(true);
      await loadBookings();
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeBookings = useMemo(() => bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.start_at) <= currentTime && new Date(booking.end_at) > currentTime), [bookings, currentTime]);
  const upcoming = useMemo(() => bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.start_at) > currentTime), [bookings, currentTime]);
  const past = useMemo(() => bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.end_at) <= currentTime).sort((a, b) => +new Date(b.start_at) - +new Date(a.start_at)), [bookings, currentTime]);
  const cancelled = useMemo(() => bookings.filter((booking) => booking.status === 'cancelled').sort((a, b) => +new Date(b.start_at) - +new Date(a.start_at)), [bookings]);
  const currentBookings = activeView === 'upcoming' ? upcoming : activeView === 'past' ? past : cancelled;

  const calendarDays = useMemo(() => {
    const firstWeekday = visibleMonth.getDay();
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))];
  }, [visibleMonth]);
  const reservationsOnSelectedDay = useMemo(() => selectedDay ? bookings.filter((booking) => sameDay(new Date(booking.start_at), selectedDay)) : [], [bookings, selectedDay]);

  const requestReservationCancellation = (booking: HostBooking) => {
    setCancellationError(null);
    setReservationPendingCancellation(booking);
  };

  const confirmReservationCancellation = async () => {
    const booking = reservationPendingCancellation;
    if (!booking || cancellingId) return;

    try {
      setCancellingId(booking.id);
      setCancellationError(null);
      const { data, error } = await supabase.functions.invoke('cancel-booking', {
        body: { bookingId: booking.id },
      });
      if (error || !data?.cancelled) {
        throw new Error(data?.error ?? error?.message ?? 'This reservation is no longer available to cancel.');
      }
      await loadBookings();
      setReservationPendingCancellation(null);
      setCancellationNotice('Reservation cancelled. The guest can see the update in their reservation history.');
    } catch (error) {
      setCancellationError(error instanceof Error ? error.message : 'We could not cancel this reservation. Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const openGuestConversation = async (booking: HostBooking) => {
    if (!session?.user.id || openingConversationForBookingId) return;

    try {
      setOpeningConversationForBookingId(booking.id);
      const { data: existingConversation, error: existingError } = await supabase
        .from('property_conversations')
        .select('id')
        .eq('host_id', session.user.id)
        .eq('guest_id', booking.guest_id)
        .maybeSingle();
      if (existingError) throw existingError;

      let conversationId = existingConversation?.id;
      if (!conversationId) {
        const { data: createdConversation, error: createError } = await supabase
          .from('property_conversations')
          .insert({
            property_id: booking.property_id,
            guest_id: booking.guest_id,
            host_id: session.user.id,
          })
          .select('id')
          .single();
        if (createError) throw createError;
        conversationId = createdConversation.id;
      }

      router.push(`/messages/${booking.property_id}?conversationId=${conversationId}` as never);
    } catch (error) {
      Alert.alert('Unable to open messages', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setOpeningConversationForBookingId(null);
    }
  };

  const issueCourtesyVisit = async () => {
    if (!courtesyBooking || isIssuingCourtesy) return;
    try {
      setIsIssuingCourtesy(true);
      setCourtesyError(null);
      const { error } = await supabase.rpc('issue_courtesy_visit', {
        p_property_id: courtesyBooking.property_id,
        p_member_id: courtesyBooking.guest_id,
        p_hours: Number(courtesyHours),
        p_expires_at: null,
        p_note: courtesyNote.trim() || null,
      });
      if (error) throw error;
      setCancellationNotice(`Courtesy Waiver issued to ${guestNames[courtesyBooking.guest_id] ?? 'the member'}.`);
      setCourtesyNote('');
      setCourtesyBooking(null);
    } catch (error) {
      setCourtesyError(error instanceof Error ? error.message : 'We could not issue this Courtesy Waiver. Please try again.');
    } finally {
      setIsIssuingCourtesy(false);
    }
  };

  const renderBooking = (booking: HostBooking, showReview = false) => {
    const property = booking.properties;
    const guestName = guestNames[booking.guest_id] ?? 'Guest';
    const dogs = bookingDogs[booking.id] ?? [];
    const subscriptionCreditsRemaining = subscriptionCredits[booking.id];
    const isActive = booking.status === 'confirmed' && new Date(booking.start_at) <= currentTime && new Date(booking.end_at) > currentTime;
    const canCancel = booking.status === 'confirmed' && new Date(booking.start_at).getTime() - currentTime.getTime() >= 60 * 60 * 1000;
    return (
      <View key={booking.id} style={[styles.bookingCard, isActive && styles.activeBookingCard]}>
        <View style={styles.bookingHeader}>
          <View style={styles.bookingCopy}>
            <Text style={styles.bookingName}>{guestName}</Text>
            <Text style={styles.bookingSite}>{property?.name ?? 'Private site'} · {property ? `${property.city}, ${property.state}` : ''}</Text>
          </View>
          <View style={[styles.statusBadge, isActive && styles.statusActive, booking.status === 'cancelled' && styles.statusCancelled]}>
            <Text style={[styles.statusText, isActive && styles.statusActiveText, booking.status === 'cancelled' && styles.statusCancelledText]}>{isActive ? 'Active now' : booking.status === 'cancelled' ? 'Cancelled' : 'Confirmed'}</Text>
          </View>
        </View>
        {isActive ? <View accessibilityLabel={`Time remaining: ${formatTimeRemaining(booking.end_at, currentTime)}`} accessibilityLiveRegion="polite" style={styles.countdownCard}><Text style={styles.countdownLabel}>TIME REMAINING</Text><Text selectable style={styles.countdownValue}>{formatTimeRemaining(booking.end_at, currentTime)}</Text><Text style={styles.countdownEndTime}>Ends at {formatTime(booking.end_at)}</Text></View> : null}
        <Text style={styles.bookingDate}>{formatDate(booking.start_at)}</Text>
        <Text style={styles.bookingDetails}>{formatTime(booking.start_at)} – {formatTime(booking.end_at)} · {booking.dog_count} {booking.dog_count === 1 ? 'dog' : 'dogs'} · ${Number(booking.total_amount).toFixed(2)}</Text>
        {subscriptionCreditsRemaining !== undefined ? <View style={styles.subscriptionBalanceCard}><Text style={styles.subscriptionBalanceLabel}>SUBSCRIPTION VISITS REMAINING</Text><Text style={styles.subscriptionBalanceValue}>{subscriptionCreditsRemaining} {subscriptionCreditsRemaining === 1 ? 'visit' : 'visits'} remaining</Text></View> : null}
        <View style={styles.dogsSection}>
          <Text style={styles.dogsSectionTitle}>Dogs attending</Text>
          {dogs.length ? dogs.map((dog) => <View key={dog.id} style={styles.dogDetailCard}><Text style={styles.dogDetailName}>{dog.name}</Text><Text style={styles.dogDetailText}>{[dog.breed, dog.size].filter(Boolean).join(' · ')}</Text>{dog.behavior_traits.length ? <View style={styles.behaviorTraitList}>{dog.behavior_traits.map((trait) => <View key={trait} style={styles.behaviorTrait}><Text style={styles.behaviorTraitText}>{trait}</Text></View>)}</View> : null}</View>) : <Text style={styles.noDogDetails}>No dog profile details were recorded for this reservation.</Text>}
        </View>
        <Text style={styles.paymentNote}>
          {booking.status === 'cancelled'
            ? 'Canceled — no money collected'
            : booking.payment_status === 'paid'
              ? 'Payment received'
              : 'Payment pending'}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={() => router.push(`/host-guests/${booking.guest_id}?guestName=${encodeURIComponent(guestName)}` as never)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Guest record</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={openingConversationForBookingId !== null} onPress={() => void openGuestConversation(booking)} style={[styles.secondaryAction, openingConversationForBookingId !== null && styles.actionDisabled]}>{openingConversationForBookingId === booking.id ? <ActivityIndicator color={colors.forest} size="small" /> : <Text style={styles.secondaryActionText}>Message</Text>}</Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setCourtesyError(null); setCourtesyBooking(booking); }} style={styles.courtesyAction}><Text style={styles.courtesyActionText}>Issue Courtesy Waiver</Text></Pressable>
          {canCancel ? <Pressable accessibilityRole="button" disabled={cancellingId !== null} onPress={() => requestReservationCancellation(booking)} style={[styles.cancelAction, cancellingId !== null && styles.actionDisabled]}><Text style={styles.cancelActionText}>Cancel reservation</Text></Pressable> : null}
          {showReview ? <Pressable onPress={() => router.push(`/review?bookingId=${booking.id}&direction=host_to_guest` as never)} style={styles.reviewAction}><Text style={styles.reviewActionText}>Review guest</Text></Pressable> : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl onRefresh={refresh} refreshing={isRefreshing} tintColor={colors.forest} />} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backButtonText}>{'<' } Host Dashboard</Text></Pressable>
        <Text style={styles.title}>Reservations & Calendar</Text>
        <Text style={styles.description}>{propertyId ? `${propertyName ? decodeURIComponent(propertyName) : 'This site'} reservations` : 'Manage guest visits across all of your sites.'}</Text>
        <View style={styles.segmentedControl}>{viewOptions.map((option) => <Pressable accessibilityRole="button" key={option.key} onPress={() => setActiveView(option.key)} style={[styles.segment, activeView === option.key && styles.segmentSelected]}><Text style={[styles.segmentText, activeView === option.key && styles.segmentTextSelected]}>{option.label}</Text></Pressable>)}</View>
        {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /><Text style={styles.loadingText}>Loading reservations...</Text></View> : null}
        {errorMessage ? <View style={styles.errorCard}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
        {cancellationNotice ? <View accessibilityRole="alert" style={styles.noticeCard}><Text style={styles.noticeText}>{cancellationNotice}</Text></View> : null}
        {!isLoading && activeView !== 'calendar' ? (
          activeView === 'upcoming' && activeBookings.length ? <><View style={styles.activeSectionHeader}><Text style={styles.activeSectionTitle}>Happening now</Text><Text style={styles.activeSectionHint}>Live visit status</Text></View>{activeBookings.map((booking) => renderBooking(booking))}{upcoming.length ? <Text style={styles.upcomingSectionTitle}>Coming up</Text> : null}{upcoming.length ? upcoming.map((booking) => renderBooking(booking)) : null}</> : currentBookings.length ? currentBookings.map((booking) => renderBooking(booking, activeView === 'past')) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No {activeView === 'canceled' ? 'cancelled' : activeView} reservations</Text><Text style={styles.emptyText}>Reservations for this view will appear here as guests book your sites.</Text></View>
        ) : null}
        {!isLoading && activeView === 'calendar' ? <>
          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}><Pressable onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>{'<'}</Text></Pressable><Text style={styles.monthTitle}>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text><Pressable onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>{'>'}</Text></Pressable></View>
            <View style={styles.calendarGrid}>{weekDays.map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}{calendarDays.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const count = bookings.filter((booking) => booking.status === 'confirmed' && sameDay(new Date(booking.start_at), day)).length;
              const selected = selectedDay ? sameDay(day, selectedDay) : false;
              return <Pressable key={day.toISOString()} onPress={() => setSelectedDay(day)} style={[styles.dayCell, count > 0 && styles.bookedDay, selected && styles.selectedDay]}><Text style={[styles.dayText, selected && styles.selectedDayText]}>{day.getDate()}</Text>{count ? <Text style={[styles.dayCount, selected && styles.selectedDayText]}>{count}</Text> : null}</Pressable>;
            })}</View>
          </View>
          <View style={styles.dayDetail}><Text style={styles.dayDetailTitle}>{selectedDay ? selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a day'}</Text>{selectedDay ? reservationsOnSelectedDay.length ? reservationsOnSelectedDay.map((booking) => renderBooking(booking, new Date(booking.end_at) <= currentTime && booking.status === 'confirmed')) : <Text style={styles.emptyText}>No reservations are scheduled on this day.</Text> : <Text style={styles.emptyText}>Booked days show the number of confirmed visits.</Text>}</View>
        </> : null}
        <HostPageGuide
          title="How to use Reservations"
          intro="Use this page to manage the selected site’s visits and see its schedule in one place."
          steps={[
            { title: 'Choose a view', text: 'Use Current, Past, Canceled, or Calendar to focus on the visits you need.' },
            { title: 'Open a reservation', text: 'Review the guest, visit time, payment status, and dog details recorded for that visit.' },
            { title: 'Understand payment pending', text: 'ROVAH handles payment automatically. The member’s card is secured for the reservation and payment is captured one hour before the visit begins. No host action is needed.' },
            { title: 'Message the guest', text: 'Tap Message to reply privately or use Special / Gift for a site-specific offer.' },
            { title: 'Manage a future visit', text: 'Cancel only when necessary. The guest will see the update in My Reservations.' },
          ]}
        />
      </ScrollView>
      <Modal
        animationType="fade"
        onRequestClose={() => !cancellingId && setReservationPendingCancellation(null)}
        transparent
        visible={reservationPendingCancellation !== null}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityRole="alert" style={styles.cancelModal}>
            <Text style={styles.cancelModalTitle}>Cancel this reservation?</Text>
            <Text style={styles.cancelModalText}>
              {reservationPendingCancellation ? `${guestNames[reservationPendingCancellation.guest_id] ?? 'This guest'} will see the cancellation in their reservation history.` : ''}
            </Text>
            <Text style={styles.cancelModalDetail}>Payment and refund details will appear here when live payments are active.</Text>
            {cancellationError ? <Text accessibilityRole="alert" style={styles.cancelModalError}>{cancellationError}</Text> : null}
            <View style={styles.cancelModalActions}>
              <Pressable accessibilityRole="button" disabled={cancellingId !== null} onPress={() => setReservationPendingCancellation(null)} style={styles.keepReservationButton}>
                <Text style={styles.keepReservationText}>Keep reservation</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={cancellingId !== null} onPress={() => void confirmReservationCancellation()} style={[styles.confirmCancelButton, cancellingId !== null && styles.actionDisabled]}>
                {cancellingId ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Text style={styles.confirmCancelText}>Cancel reservation</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => !isIssuingCourtesy && setCourtesyBooking(null)} transparent visible={courtesyBooking !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.cancelModal}>
            <Text style={styles.cancelModalTitle}>Issue Courtesy Waiver</Text>
            <Text style={styles.cancelModalText}>{courtesyBooking ? `Give ${guestNames[courtesyBooking.guest_id] ?? 'this member'} free time at ${courtesyBooking.properties?.name ?? 'this private space'}.` : ''}</Text>
            <Text style={styles.courtesyLabel}>Free hours</Text>
            <TextInput keyboardType="decimal-pad" onChangeText={(value) => setCourtesyHours(value.replace(/[^0-9.]/g, ''))} placeholder="1" style={styles.courtesyInput} value={courtesyHours} />
            <Text style={styles.cancelModalDetail}>This Courtesy Waiver is valid only at this site and expires seven days after you send it. You may issue one to this guest each calendar month.</Text>
            <Text style={styles.courtesyLabel}>Note for the member (optional)</Text>
            <TextInput multiline onChangeText={setCourtesyNote} placeholder="Enjoy a Courtesy Waiver at my space." style={[styles.courtesyInput, styles.courtesyNoteInput]} value={courtesyNote} />
            {courtesyError ? <Text accessibilityRole="alert" style={styles.cancelModalError}>{courtesyError}</Text> : null}
            <View style={styles.cancelModalActions}>
              <Pressable disabled={isIssuingCourtesy} onPress={() => setCourtesyBooking(null)} style={styles.keepReservationButton}><Text style={styles.keepReservationText}>Not now</Text></Pressable>
              <Pressable disabled={isIssuingCourtesy} onPress={() => void issueCourtesyVisit()} style={[styles.courtesyConfirmButton, isIssuingCourtesy && styles.actionDisabled]}>{isIssuingCourtesy ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Text style={styles.confirmCancelText}>Issue Courtesy Waiver</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 40 }, backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, title: { color: colors.forest, fontSize: 30, fontWeight: '900' }, description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }, segmentedControl: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 22, padding: 4 }, segment: { alignItems: 'center', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 3 }, segmentSelected: { backgroundColor: colors.forest }, segmentText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, segmentTextSelected: { color: colors.warmWhite }, loading: { alignItems: 'center', paddingVertical: 44 }, loadingText: { color: colors.muted, marginTop: 12 }, errorCard: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 14, borderWidth: 1, marginTop: 18, padding: 14 }, errorText: { color: colors.red, fontWeight: '700' }, noticeCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 18, padding: 14 }, noticeText: { color: colors.forest, fontWeight: '700', lineHeight: 20 }, emptyCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 18 }, emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 }, activeSectionHeader: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }, activeSectionTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' }, activeSectionHint: { color: colors.olive, fontSize: 12, fontWeight: '800' }, upcomingSectionTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginTop: 24 }, bookingCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 16 }, activeBookingCard: { borderColor: colors.forest, borderWidth: 2 }, bookingHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' }, bookingCopy: { flex: 1, paddingRight: 10 }, bookingName: { color: colors.forest, fontSize: 17, fontWeight: '900' }, bookingSite: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }, statusBadge: { backgroundColor: colors.lightGreen, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, statusActive: { backgroundColor: colors.forest }, statusCancelled: { backgroundColor: '#FCEDEB' }, statusText: { color: colors.olive, fontSize: 11, fontWeight: '900' }, statusActiveText: { color: colors.warmWhite }, statusCancelledText: { color: colors.red }, countdownCard: { backgroundColor: colors.lightGreen, borderColor: '#91B58D', borderRadius: 14, borderWidth: 1, marginTop: 14, padding: 13 }, countdownLabel: { color: colors.olive, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, countdownValue: { color: colors.forest, fontSize: 26, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 3 }, countdownEndTime: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 3 }, bookingDate: { color: colors.forest, fontSize: 15, fontWeight: '800', marginTop: 15 }, bookingDetails: { color: colors.muted, fontSize: 14, fontVariant: ['tabular-nums'], lineHeight: 21, marginTop: 4 }, paymentNote: { color: colors.brown, fontSize: 12, fontWeight: '800', marginTop: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, secondaryAction: { alignItems: 'center', borderColor: colors.forest, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11 }, secondaryActionText: { color: colors.forest, fontSize: 12, fontWeight: '900' }, cancelAction: { alignItems: 'center', borderColor: colors.red, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11 }, cancelActionText: { color: colors.red, fontSize: 12, fontWeight: '900' }, actionDisabled: { opacity: 0.55 }, reviewAction: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 10, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11 }, reviewActionText: { color: colors.warmWhite, fontSize: 12, fontWeight: '900' }, calendarCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 14 }, monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }, monthButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 }, monthButtonText: { color: colors.forest, fontSize: 19, fontWeight: '900' }, monthTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekDay: { color: colors.muted, fontSize: 11, fontWeight: '900', marginBottom: 8, textAlign: 'center', width: '14.2857%' }, dayCell: { alignItems: 'center', borderRadius: 18, height: 42, justifyContent: 'center', marginBottom: 5, width: '14.2857%' }, bookedDay: { backgroundColor: colors.lightGreen }, selectedDay: { backgroundColor: colors.forest }, dayText: { color: colors.forest, fontSize: 13, fontWeight: '800' }, dayCount: { color: colors.brown, fontSize: 10, fontWeight: '900' }, selectedDayText: { color: colors.warmWhite }, dayDetail: { marginTop: 12 }, dayDetailTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' }, modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(20, 38, 24, 0.52)', flex: 1, justifyContent: 'center', padding: 20 }, cancelModal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 440, padding: 22, width: '100%' }, cancelModalTitle: { color: colors.forest, fontSize: 21, fontWeight: '900' }, cancelModalText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 9 }, cancelModalDetail: { color: colors.brown, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 9 }, cancelModalError: { color: colors.red, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 12 }, cancelModalActions: { flexDirection: 'row', gap: 10, marginTop: 22 }, keepReservationButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 }, keepReservationText: { color: colors.forest, fontSize: 14, fontWeight: '900' }, confirmCancelButton: { alignItems: 'center', backgroundColor: colors.red, borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 }, confirmCancelText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' },
  subscriptionBalanceCard: { backgroundColor: colors.lightGreen, borderColor: '#91B58D', borderRadius: 14, borderWidth: 1, marginTop: 13, padding: 12 },
  subscriptionBalanceLabel: { color: colors.olive, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  subscriptionBalanceValue: { color: colors.forest, fontSize: 17, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 4 },
  dogsSection: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 13, paddingTop: 12 },
  dogsSectionTitle: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: 8 },
  dogDetailCard: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginTop: 7, padding: 11 },
  dogDetailName: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  dogDetailText: { color: colors.muted, fontSize: 13, marginTop: 3 },
  courtesyAction: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#91B58D', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11 },
  courtesyActionText: { color: colors.forest, fontSize: 12, fontWeight: '900' },
  courtesyLabel: { color: colors.forest, fontSize: 13, fontWeight: '900', marginTop: 14 },
  courtesyInput: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 11, borderWidth: 1, color: colors.forest, fontSize: 15, marginTop: 6, minHeight: 48, paddingHorizontal: 12 },
  courtesyNoteInput: { minHeight: 84, paddingTop: 11, textAlignVertical: 'top' },
  courtesyConfirmButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
  behaviorTraitList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  behaviorTrait: { backgroundColor: colors.lightGreen, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  behaviorTraitText: { color: colors.forest, fontSize: 11, fontWeight: '800' },
  noDogDetails: { color: colors.muted, fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
});
