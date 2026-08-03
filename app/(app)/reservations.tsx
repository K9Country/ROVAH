import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { HostPageGuide } from '../../components/host-page-guide';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type BookingProperty = {
  name: string;
  city: string;
  state: string;
};

type GuestBooking = {
  id: string;
  property_id: string;
  start_at: string;
  end_at: string;
  dog_count: number;
  total_amount: number;
  payment_provider: string | null;
  loyalty_pass_offer_id: string | null;
  member_loyalty_pass_id: string | null;
  status: 'confirmed' | 'payment_pending' | 'cancelled';
  payment_status: 'pending_configuration' | 'processing' | 'authorized' | 'scheduled' | 'paid' | 'refunded' | 'failed' | 'cancelled';
  stripe_checkout_session_id: string | null;
  properties: BookingProperty | null;
  dogs: BookingDog[];
};

type BookingDog = {
  dog_profile_id: string | null;
  name: string;
  photo_url: string | null;
};

type PaymentConfirmation = {
  id: string;
  propertyName: string;
  totalAmount: number;
  paymentStatus: 'authorized' | 'scheduled' | 'paid';
};

const cancellationWindowMs = 60 * 60 * 1000;

function formatVisitDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatVisitTime(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ReservationsScreen() {
  const { session } = useAuth();
  const { payment, session_id: checkoutSessionId } = useLocalSearchParams<{
    payment?: string;
    session_id?: string;
  }>();
  const [bookings, setBookings] = useState<GuestBooking[]>([]);
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(
    null
  );
  const [bookingToCancelId, setBookingToCancelId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [paymentConfirmation, setPaymentConfirmation] = useState<PaymentConfirmation | null>(null);
  const [paymentConfirmationError, setPaymentConfirmationError] = useState<string | null>(null);
  const [subscriptionCredits, setSubscriptionCredits] = useState<Record<string, number>>({});
  const handledCheckoutSessionIds = useRef(new Set<string>());

  const notifyReservationEmail = useCallback((bookingId: string) => {
    void supabase.functions
      .invoke('notify-app-email', {
        body: { type: 'reservation_created', resourceId: bookingId },
      })
      .then(({ error }) => {
        if (error) console.warn('Reservation notification email was not sent:', error.message);
      })
      .catch((error) => console.warn('Reservation notification email was not sent:', error));
  }, []);

  const loadBookings = useCallback(async () => {
    if (!session?.user.id) {
      setBookings([]);
      setReviewedBookingIds(new Set());
      setSubscriptionCredits({});
      setIsLoading(false);
      return;
    }

    const [bookingResult, reviewResult, dogProfileResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, property_id, start_at, end_at, dog_count, total_amount, payment_provider, loyalty_pass_offer_id, member_loyalty_pass_id, status, payment_status, stripe_checkout_session_id, properties(name, city, state)'
        )
        .eq('guest_id', session.user.id)
        .order('start_at', { ascending: true }),
      supabase
        .from('booking_reviews')
        .select('booking_id')
        .eq('reviewer_id', session.user.id)
        .eq('review_type', 'guest_to_host'),
      supabase
        .from('dog_profiles')
        .select('id, photo_path')
        .eq('user_id', session.user.id),
    ]);

    if (bookingResult.error) {
      Alert.alert('Unable to load reservations', bookingResult.error.message);
      setBookings([]);
      return;
    }

    const bookingIds = (bookingResult.data ?? []).map((booking) => booking.id);
    const { data: bookingDogs, error: bookingDogsError } = bookingIds.length
      ? await supabase
        .from('booking_dogs')
        .select('booking_id, dog_profile_id, name')
        .in('booking_id', bookingIds)
      : { data: [], error: null };

    if (bookingDogsError) {
      Alert.alert('Unable to load reservation dog details', bookingDogsError.message);
    }

    const dogPhotoUrls = new Map<string, string>();
    await Promise.all((dogProfileResult.data ?? []).map(async (dog) => {
      if (!dog.photo_path) return;
      const { data: signedPhoto } = await supabase.storage
        .from('dog-profile-images')
        .createSignedUrl(dog.photo_path, 60 * 60);
      if (signedPhoto?.signedUrl) dogPhotoUrls.set(dog.id, signedPhoto.signedUrl);
    }));

    const dogsByBookingId = new Map<string, BookingDog[]>();
    (bookingDogs ?? []).forEach((dog) => {
      const dogs = dogsByBookingId.get(dog.booking_id) ?? [];
      dogs.push({
        dog_profile_id: dog.dog_profile_id,
        name: dog.name,
        photo_url: dog.dog_profile_id ? dogPhotoUrls.get(dog.dog_profile_id) ?? null : null,
      });
      dogsByBookingId.set(dog.booking_id, dogs);
    });

    const bookingRows = (bookingResult.data ?? []).map((booking) => ({
      ...booking,
      properties: Array.isArray(booking.properties)
        ? booking.properties[0] ?? null
        : booking.properties,
      dogs: dogsByBookingId.get(booking.id) ?? [],
    }));
    setBookings(bookingRows as GuestBooking[]);
    const subscriptionPassIds = [...new Set(bookingRows.flatMap((booking) => booking.member_loyalty_pass_id ? [booking.member_loyalty_pass_id] : []))];
    if (subscriptionPassIds.length || bookingIds.length) {
      const [passIdResult, purchaseBookingResult] = await Promise.all([
        subscriptionPassIds.length
          ? supabase.from('member_loyalty_passes').select('id, credit_hours_remaining').in('id', subscriptionPassIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('member_loyalty_passes').select('purchase_booking_id, credit_hours_remaining').in('purchase_booking_id', bookingIds),
      ]);
      if (passIdResult.error || purchaseBookingResult.error) {
        setSubscriptionCredits({});
      } else {
        const creditsByPassId = Object.fromEntries((passIdResult.data ?? []).map((pass) => [pass.id, Number(pass.credit_hours_remaining)]));
        const creditsByPurchaseBookingId = Object.fromEntries((purchaseBookingResult.data ?? []).flatMap((pass) => pass.purchase_booking_id ? [[pass.purchase_booking_id, Number(pass.credit_hours_remaining)]] : []));
        setSubscriptionCredits(Object.fromEntries(bookingRows.flatMap((booking) => {
          const balance = booking.member_loyalty_pass_id ? creditsByPassId[booking.member_loyalty_pass_id] : creditsByPurchaseBookingId[booking.id];
          return balance === undefined ? [] : [[booking.id, balance]];
        })));
      }
    } else {
      setSubscriptionCredits({});
    }
    setReviewedBookingIds(new Set((reviewResult.data ?? []).map((review) => review.booking_id)));
  }, [session?.user.id]);

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

  useEffect(() => {
    if (payment !== 'success' || !checkoutSessionId || !session?.user.id) return;
    if (handledCheckoutSessionIds.current.has(checkoutSessionId)) return;
    handledCheckoutSessionIds.current.add(checkoutSessionId);

    const confirmPaidCheckout = async () => {
      setPaymentConfirmationError(null);
      const { data, error } = await supabase.functions.invoke('confirm-booking-payment', {
        body: { sessionId: checkoutSessionId },
      });
      if (error || !['authorized', 'scheduled', 'paid'].includes(data?.paymentStatus) || !data.booking) {
        const functionError = error as Error & { context?: Response };
        let message = 'Your payment is still being confirmed. Refresh this page in a moment; do not submit payment again.';
        if (functionError?.context) {
          try {
            const response = await functionError.context.clone().json() as { error?: string };
            if (response.error) message = response.error;
          } catch {
            // Keep the safe guidance above if the function did not return JSON.
          }
        }
        setPaymentConfirmationError(message);
        return;
      }
      setPaymentConfirmation(data.booking as PaymentConfirmation);
      await loadBookings();
      notifyReservationEmail(data.booking.id);
    };

    void confirmPaidCheckout();
  }, [checkoutSessionId, loadBookings, notifyReservationEmail, payment, session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;

    const pendingCheckout = bookings.find(
      (booking) =>
        booking.payment_status === 'processing' &&
        Boolean(booking.stripe_checkout_session_id) &&
        !handledCheckoutSessionIds.current.has(booking.stripe_checkout_session_id!)
    );
    if (!pendingCheckout?.stripe_checkout_session_id) return;

    handledCheckoutSessionIds.current.add(pendingCheckout.stripe_checkout_session_id);
    const quietlyReconcilePendingCheckout = async () => {
      const { data } = await supabase.functions.invoke('confirm-booking-payment', {
        body: { sessionId: pendingCheckout.stripe_checkout_session_id },
      });
      if (!['authorized', 'scheduled', 'paid'].includes(data?.paymentStatus) || !data.booking) return;

      setPaymentConfirmationError(null);
      setPaymentConfirmation(data.booking as PaymentConfirmation);
      await loadBookings();
      notifyReservationEmail(data.booking.id);
    };

    void quietlyReconcilePendingCheckout();
  }, [bookings, loadBookings, notifyReservationEmail, session?.user.id]);

  useEffect(() => {
    const refreshClock = setInterval(
      () => setCurrentTime(Date.now()),
      30_000
    );
    return () => clearInterval(refreshClock);
  }, []);

  const upcomingBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === 'confirmed' && new Date(booking.start_at).getTime() > currentTime
      ),
    [bookings, currentTime]
  );

  const startedBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === 'confirmed' &&
          new Date(booking.start_at).getTime() <= currentTime &&
          new Date(booking.end_at).getTime() > currentTime
      ),
    [bookings, currentTime]
  );

  const historyBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.status === 'cancelled' ||
            (booking.status === 'confirmed' && new Date(booking.end_at).getTime() <= currentTime)
        )
        .sort(
          (first, second) =>
            new Date(second.start_at).getTime() -
            new Date(first.start_at).getTime()
        ),
    [bookings, currentTime]
  );

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadBookings();
    } finally {
      setIsRefreshing(false);
    }
  };

  const canCancel = (booking: GuestBooking) =>
    booking.status === 'confirmed' &&
    new Date(booking.start_at).getTime() - currentTime >= cancellationWindowMs;

  const cancelBooking = async (booking: GuestBooking) => {
    try {
      setCancellingBookingId(booking.id);
      const { data, error } = await supabase.functions.invoke('cancel-booking', {
        body: { bookingId: booking.id },
      });
      if (error || !data?.cancelled) {
        const functionError = error as Error & { context?: Response };
        let message = data?.error ?? 'The one-hour cancellation window has closed or this reservation was already changed.';
        if (functionError?.context) {
          try {
            const body = await functionError.context.clone().json() as { error?: string };
            if (body.error) message = body.error;
          } catch { /* Keep the reliable default guidance. */ }
        }
        throw new Error(message);
      }

      setBookingToCancelId(null);
      await loadBookings();
    } catch (error) {
      Alert.alert(
        'Unable to cancel reservation',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setCancellingBookingId(null);
    }
  };

  const renderBooking = (booking: GuestBooking, isUpcoming: boolean, isStarted = false) => {
    const start = new Date(booking.start_at);
    const end = new Date(booking.end_at);
    const propertyName = booking.properties?.name ?? 'Private space';
    const propertyLocation = booking.properties
      ? `${booking.properties.city}, ${booking.properties.state}`
      : 'ROVAH listing';
    const cancellationAvailable = canCancel(booking);
    const isCancelling = cancellingBookingId === booking.id;
    const isConfirmingCancellation = bookingToCancelId === booking.id;
    const subscriptionCreditsRemaining = subscriptionCredits[booking.id];

    return (
      <View key={booking.id} style={styles.bookingCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeading}>
            <Text style={styles.propertyName}>{propertyName}</Text>
            <Text style={styles.propertyLocation}>{propertyLocation}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              booking.status === 'cancelled'
                ? styles.cancelledBadge
                : isStarted
                  ? styles.startedBadge
                : styles.confirmedBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                booking.status === 'cancelled'
                  ? styles.cancelledStatusText
                  : styles.confirmedStatusText,
              ]}
            >
              {booking.status === 'cancelled' ? 'Cancelled' : isStarted ? 'Started' : 'Confirmed'}
            </Text>
          </View>
        </View>

        <Text style={styles.visitDate}>{formatVisitDate(start)}</Text>
        <Text style={styles.visitTime}>
          {formatVisitTime(start)} – {formatVisitTime(end)}
        </Text>
        <Text style={styles.visitDetails}>
          {booking.dog_count} {booking.dog_count === 1 ? 'dog' : 'dogs'} · ${Number(booking.total_amount).toFixed(2)}
        </Text>
        {subscriptionCreditsRemaining !== undefined ? <View style={styles.subscriptionBalanceCard}><Text style={styles.subscriptionBalanceLabel}>SUBSCRIPTION VISITS REMAINING</Text><Text style={styles.subscriptionBalanceValue}>{subscriptionCreditsRemaining} {subscriptionCreditsRemaining === 1 ? 'visit' : 'visits'} remaining</Text></View> : null}
        <Text style={styles.paymentStatusText}>
          {booking.payment_status === 'paid'
            ? 'Payment captured and received'
            : booking.payment_status === 'authorized'
              ? 'Payment secured — captured one hour before your visit'
              : booking.payment_status === 'scheduled'
                ? 'Card saved — payment scheduled one hour before your visit'
            : booking.payment_status === 'cancelled'
              ? 'No payment collected'
              : 'Payment setup pending — no money collected'}
        </Text>

        {booking.dogs.length ? <View style={styles.dogsSection}>
          <Text style={styles.dogsSectionTitle}>Dogs attending</Text>
          <View style={styles.dogList}>
            {booking.dogs.map((dog, index) => <View key={`${booking.id}-${dog.dog_profile_id ?? dog.name}-${index}`} style={styles.dogRow}>
              {dog.photo_url ? <Image accessibilityLabel={`${dog.name}'s photo`} source={{ uri: dog.photo_url }} style={styles.dogPhoto} /> : <View style={styles.dogPhotoFallback}><Text style={styles.dogPhotoFallbackText}>{dog.name.slice(0, 1).toUpperCase()}</Text></View>}
              <View style={styles.dogCopy}>
                <Text style={styles.dogName}>{dog.name}</Text>
              </View>
            </View>)}
          </View>
        </View> : null}

        {(isUpcoming || isStarted) && booking.status === 'confirmed' ? (
          <>
            {isStarted ? <Text style={styles.visitStartedText}>Your visit is in progress.</Text> : cancellationAvailable ? (
              isConfirmingCancellation ? (
                <View style={styles.cancelConfirmation}>
                  <Text style={styles.cancelConfirmationText}>
                    Cancel this reservation? You may cancel until one hour before the visit.
                  </Text>
                  <View style={styles.cancelConfirmationActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isCancelling}
                      onPress={() => setBookingToCancelId(null)}
                      style={({ pressed }) => [styles.keepButton, pressed && styles.buttonPressed, isCancelling && styles.buttonDisabled]}
                    >
                      <Text style={styles.keepButtonText}>Keep it</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isCancelling}
                      onPress={() => void cancelBooking(booking)}
                      style={({ pressed }) => [styles.confirmCancelButton, pressed && styles.buttonPressed, isCancelling && styles.buttonDisabled]}
                    >
                      {isCancelling ? <ActivityIndicator color={colors.cream} size="small" /> : <Text style={styles.confirmCancelButtonText}>Yes, cancel</Text>}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={isCancelling}
                  onPress={() => setBookingToCancelId(booking.id)}
                  style={({ pressed }) => [
                    styles.cancelButton,
                    pressed && styles.buttonPressed,
                    isCancelling && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.cancelButtonText}>Cancel Reservation</Text>
                </Pressable>
              )
            ) : (
              <Text style={styles.windowClosedText}>
                The cancellation window closed one hour before this visit.
              </Text>
            )}

            <Pressable
              accessibilityLabel={`Message the host of ${propertyName}`}
              accessibilityRole="button"
              onPress={() => router.push(`/messages/${booking.property_id}` as never)}
              style={({ pressed }) => [
                styles.messageHostButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.messageHostButtonText}>Message Host</Text>
              <Text style={styles.messageHostIcon}>💬</Text>
            </Pressable>
          </>
        ) : null}

        {!isUpcoming && !isStarted && booking.status === 'confirmed' ? (
          reviewedBookingIds.has(booking.id) ? <View style={styles.reviewComplete}><Text style={styles.reviewCompleteText}>★ Review complete</Text></View> : <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/review?bookingId=${booking.id}&direction=guest_to_host` as never)}
              style={({ pressed }) => [styles.reviewButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.reviewButtonText}>Review My Visit</Text>
            </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Modal
        animationType="fade"
        transparent
        visible={paymentConfirmation !== null}
        onRequestClose={() => setPaymentConfirmation(null)}
      >
        <View style={styles.paymentModalBackdrop}>
          <View style={styles.paymentModalCard}>
            <Text style={styles.paymentModalEyebrow}>{paymentConfirmation?.paymentStatus === 'paid' ? 'PAYMENT CAPTURED' : paymentConfirmation?.paymentStatus === 'scheduled' ? 'CARD SAVED' : 'PAYMENT SECURED'}</Text>
            <Text style={styles.paymentModalTitle}>Reservation confirmed</Text>
            {(() => {
              const confirmedBooking = paymentConfirmation ? bookings.find((booking) => booking.id === paymentConfirmation.id) : undefined;
              const isSubscriptionPurchase = confirmedBooking?.payment_provider === 'loyalty_pass_purchase';
              return <>
            <Text style={styles.paymentModalText}>
              {paymentConfirmation?.propertyName ?? 'Your private space'} is reserved. {isSubscriptionPurchase
                ? `Your subscription payment of $${Number(paymentConfirmation?.totalAmount ?? 0).toFixed(2)} was received. This reservation uses the first included visit.`
                : paymentConfirmation?.paymentStatus === 'paid'
                ? `Your payment of $${Number(paymentConfirmation?.totalAmount ?? 0).toFixed(2)} has been captured.`
                : paymentConfirmation?.paymentStatus === 'scheduled'
                  ? `Your card is saved for this reservation. The $${Number(paymentConfirmation?.totalAmount ?? 0).toFixed(2)} charge is scheduled one hour before your visit. Cancel before then and no charge will be made.`
                  : `Your $${Number(paymentConfirmation?.totalAmount ?? 0).toFixed(2)} payment is secured and will be captured one hour before your visit. Cancel before then to release the authorization automatically.`}
            </Text>
            {confirmedBooking ? <View style={styles.paymentModalDetails}><Text style={styles.paymentModalDetailText}>{formatVisitDate(new Date(confirmedBooking.start_at))}</Text><Text style={styles.paymentModalDetailText}>{formatVisitTime(new Date(confirmedBooking.start_at))} – {formatVisitTime(new Date(confirmedBooking.end_at))}</Text><Text style={styles.paymentModalDetailText}>{confirmedBooking.dogs.map((dog) => dog.name).join(', ') || `${confirmedBooking.dog_count} dog${confirmedBooking.dog_count === 1 ? '' : 's'} attending`}</Text></View> : null}
              </>;
            })()}
            <Pressable accessibilityRole="button" onPress={() => setPaymentConfirmation(null)} style={styles.paymentModalPrimaryButton}>
              <Text style={styles.paymentModalPrimaryButtonText}>View Reservation</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/dashboard')} style={styles.paymentModalSecondaryButton}>
              <Text style={styles.paymentModalSecondaryButtonText}>Return to Member Dashboard</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor="#263A24"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>My Reservations</Text>
        <Text style={styles.description}>
          Started visits appear first, followed by upcoming reservations. Completed visits are ready for review.
        </Text>
        {paymentConfirmationError ? <View style={styles.paymentPendingNotice}>
          <Text style={styles.paymentPendingTitle}>Confirming your payment</Text>
          <Text style={styles.paymentPendingText}>{paymentConfirmationError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void handleRefresh()} style={styles.paymentPendingButton}>
            <Text style={styles.paymentPendingButtonText}>Refresh Reservations</Text>
          </Pressable>
        </View> : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#263A24" size="large" />
            <Text style={styles.loadingText}>Loading your reservations...</Text>
          </View>
        ) : (
          <>
            {startedBookings.length > 0 ? <>
              <Text style={styles.sectionTitle}>Started</Text>
              {startedBookings.map((booking) => renderBooking(booking, false, true))}
            </> : null}

            <Text style={styles.sectionTitle}>Upcoming</Text>
            {upcomingBookings.length > 0 ? (
              upcomingBookings.map((booking) => renderBooking(booking, true))
            ) : (
              <>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No upcoming reservations</Text>
                  <Text style={styles.emptyText}>
                    Your next private-space visit will appear here.
                  </Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.push('/search')} style={styles.searchPropertiesButton}>
                  <Text style={styles.searchPropertiesButtonText}>Make a reservation</Text>
                </Pressable>
              </>
            )}

            {historyBookings.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Completed & Cancelled</Text>
                {historyBookings.map((booking) => renderBooking(booking, false))}
              </>
            ) : null}
          </>
        )}
        <HostPageGuide
          title="How to use My Reservations"
          intro="Use this page to prepare for upcoming visits, check past visits, and review eligible completed stays."
          tone="forest"
          steps={[
            { title: 'Check upcoming visits', text: 'Review the date, time, site, and dogs attached to your next reservation.' },
            { title: 'Cancel a regular-rate visit', text: 'Use Cancel Reservation more than one hour before the visit starts. ROVAH records the cancellation before payment is collected, so there is no charge or refund.' },
            { title: 'Check subscription visits', text: 'A subscription visit shows its remaining visit balance. Subscription purchases are not refundable and may be used only at the site that issued them before their expiration date.' },
            { title: 'Message the host', text: 'Open the reservation or Messages if you have a question before the visit.' },
            { title: 'Review a completed visit', text: 'When Review My Visit is available, share your experience for other members.' },
            { title: 'Use site-specific offers', text: 'A valid Courtesy Waiver or Special Discount appears when you book the same site.' },
          ]}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', marginBottom: 12, minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginTop: 14 },
  title: { ...memberUi.pageTitle, marginTop: 6 },
  description: { ...memberUi.pageDescription, marginBottom: 24 },
  sectionTitle: { ...memberUi.cardTitle, fontSize: 20, marginBottom: 12, marginTop: 4 },
  bookingCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 5, padding: 17 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardHeading: { flex: 1, paddingRight: 10 },
  propertyName: memberUi.cardTitle,
  propertyLocation: { color: colors.muted, fontSize: 13, marginTop: 4 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  confirmedBadge: { backgroundColor: colors.lightGreen },
  startedBadge: { backgroundColor: '#FFF5E8' },
  cancelledBadge: { backgroundColor: '#F0C5C0' },
  statusText: { fontSize: 11, fontWeight: '900' },
  confirmedStatusText: { color: '#3D522C' },
  cancelledStatusText: { color: '#95423A' },
  visitDate: { color: colors.forest, fontSize: 16, fontWeight: '900', marginTop: 18 },
  visitTime: { color: colors.brown, fontSize: 15, fontWeight: '800', marginTop: 4 },
  visitDetails: { color: colors.muted, fontSize: 14, marginTop: 7 },
  paymentStatusText: { color: colors.muted, fontSize: 12, fontStyle: 'italic', lineHeight: 18, marginTop: 5 },
  dogsSection: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  dogsSectionTitle: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: 5 },
  dogList: { gap: 5 },
  dogRow: { alignItems: 'center', backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 14, borderWidth: 1, flexDirection: 'row', padding: 10 },
  dogPhoto: { borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 44, marginRight: 10, width: 44 },
  dogPhotoFallback: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 10, width: 44 },
  dogPhotoFallbackText: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  dogCopy: { flex: 1 },
  dogName: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  cancelButton: { alignItems: 'center', backgroundColor: '#FFF1EE', borderColor: '#D88A80', borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 48 },
  cancelButtonText: { color: '#95423A', fontSize: 15, fontWeight: '900' },
  cancelConfirmation: { backgroundColor: '#FFF1EE', borderColor: '#D88A80', borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 14 },
  cancelConfirmationText: { color: colors.forest, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  cancelConfirmationActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  keepButton: { alignItems: 'center', backgroundColor: colors.cream, borderColor: '#D88A80', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42 },
  keepButtonText: { color: '#95423A', fontSize: 14, fontWeight: '900' },
  confirmCancelButton: { alignItems: 'center', backgroundColor: '#95423A', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42 },
  confirmCancelButtonText: { color: colors.cream, fontSize: 14, fontWeight: '900' },
  messageHostButton: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: 5, minHeight: 48 },
  messageHostButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  messageHostIcon: { fontSize: 17, marginLeft: 8 },
  reviewButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 5, minHeight: 48 },
  reviewButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  reviewComplete: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 5, minHeight: 48 },
  reviewCompleteText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  visitStartedText: { color: colors.brown, fontSize: 13, fontWeight: '800', marginTop: 16 },
  windowClosedText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.6 },
  emptyCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginBottom: 22, padding: 18 },
  emptyTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  searchPropertiesButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginBottom: 22, marginTop: -10, minHeight: 48, paddingHorizontal: 20 },
  searchPropertiesButtonText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  paymentPendingNotice: { backgroundColor: '#FFF7E9', borderColor: '#D4A660', borderRadius: 16, borderWidth: 1, marginBottom: 20, padding: 16 },
  paymentPendingTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  paymentPendingText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  paymentPendingButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 42 },
  paymentPendingButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  subscriptionBalanceCard: { backgroundColor: colors.lightGreen, borderColor: '#91B58D', borderRadius: 14, borderWidth: 1, marginTop: 13, padding: 12 },
  subscriptionBalanceLabel: { color: colors.olive, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  subscriptionBalanceValue: { color: colors.forest, fontSize: 17, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 4 },
  paymentModalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(28, 39, 27, 0.6)', flex: 1, justifyContent: 'center', padding: 22 },
  paymentModalCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 22, borderWidth: 1, maxWidth: 460, padding: 24, width: '100%' },
  paymentModalEyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  paymentModalTitle: { color: colors.forest, fontSize: 26, fontWeight: '900', lineHeight: 32, marginTop: 8 },
  paymentModalText: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 12 },
  paymentModalDetails: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 13 },
  paymentModalDetailText: { color: colors.forest, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  paymentModalPrimaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 50 },
  paymentModalPrimaryButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  paymentModalSecondaryButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 9, minHeight: 50 },
  paymentModalSecondaryButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  loadingState: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { color: colors.muted, fontSize: 15, marginTop: 14 },
});
