import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UnreadMessageIcon } from '../../components/unread-message-icon';
import { colors } from '../../constants/theme';
import { getUnreadConversationIds } from '../../lib/messaging';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { HostProfile } from '../../types/host-profile';
import type { PropertyConversation } from '../../types/messaging';
import type { Property } from '../../types/property';

type HostDashboardData = {
  profile: HostProfile | null;
  properties: (Property & { booking_count: number; booking_total: number })[];
};

function isJwtIssuedInFutureError(error: { message?: string } | null) {
  return error?.message?.toLowerCase().includes('jwt issued at future') ?? false;
}

export default function HostDashboardScreen() {
  const { session } = useAuth();
  const [dashboardData, setDashboardData] = useState<HostDashboardData>({
    profile: null,
    properties: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [hasUnreadGuestMessages, setHasUnreadGuestMessages] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAdministrator, setIsAdministrator] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!session?.user.id) {
      setDashboardData({ profile: null, properties: [] });
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const loadHostingRecords = () =>
      Promise.all([
        supabase
          .from('host_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('properties')
          .select('*')
          .eq('host_id', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ]);

    let [profileResult, propertiesResult, administratorResult] =
      await loadHostingRecords();

    const initialError = profileResult.error ?? propertiesResult.error;
    if (isJwtIssuedInFutureError(initialError)) {
      const { error: refreshError } = await supabase.auth.refreshSession();

      if (!refreshError) {
        [profileResult, propertiesResult, administratorResult] =
          await loadHostingRecords();
      }
    }

    if (profileResult.error || propertiesResult.error) {
      const error = profileResult.error ?? propertiesResult.error;
      setErrorMessage(
        isJwtIssuedInFutureError(error)
          ? 'Your device clock may be out of sync. Turn on automatic date and time, then try again.'
          : error?.message ?? 'We could not load your hosting information. Please try again.'
      );
      setIsLoading(false);
      return;
    }

    const properties = (propertiesResult.data ?? []) as Property[];
    const propertyIds = properties.map((property) => property.id);
    const { data: bookingsData, error: bookingsError } = propertyIds.length
      ? await supabase
          .from('bookings')
          .select('property_id, total_amount')
          .eq('status', 'confirmed')
          .in('property_id', propertyIds)
      : { data: [], error: null };

    if (bookingsError) {
      setErrorMessage(bookingsError.message);
      setIsLoading(false);
      return;
    }

    const bookingTotalsByProperty = (bookingsData ?? []).reduce<Record<string, { count: number; total: number }>>((totals, booking) => {
      if (!booking.property_id) {
        return totals;
      }

      const current = totals[booking.property_id] ?? { count: 0, total: 0 };
      totals[booking.property_id] = { count: current.count + 1, total: current.total + Number(booking.total_amount ?? 0) };
      return totals;
    }, {});

    const propertiesWithBookingCounts = properties.map((property) => ({
      ...property,
      booking_count: bookingTotalsByProperty[property.id]?.count ?? 0,
      booking_total: bookingTotalsByProperty[property.id]?.total ?? 0,
    }));

    setDashboardData({
      profile: profileResult.data as HostProfile | null,
      properties: propertiesWithBookingCounts,
    });
    setIsAdministrator(Boolean(administratorResult.data) && !administratorResult.error);

    const { data: conversationData } = await supabase
      .from('property_conversations')
      .select('*')
      .eq('host_id', session.user.id);
    const conversations = (conversationData ?? []) as PropertyConversation[];
    const unreadIds = await getUnreadConversationIds(
      conversations,
      session.user.id
    );
    setHasUnreadGuestMessages(unreadIds.size > 0);
    setIsLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const fullName =
    dashboardData.profile?.full_name ??
    session?.user.user_metadata?.full_name ??
    '';
  const firstName = fullName.trim().split(' ')[0] || 'Host';
  const profileImageUrl = dashboardData.profile?.profile_image_path
    ? supabase.storage
        .from('host-profile-images')
        .getPublicUrl(dashboardData.profile.profile_image_path).data.publicUrl
    : null;

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);

      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Unable to sign out', error.message);
        return;
      }

      router.dismissAll();
      router.replace('/');
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not sign you out. Please try again.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const shareThisSite = async (property: Property) => {
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

  const uploadProfilePhoto = async () => {
    if (!session?.user.id || isUploadingProfilePhoto) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to add your host photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    try {
      setIsUploadingProfilePhoto(true);
      const asset = result.assets[0];
            const rawExtension = asset.fileName?.split('.').pop() ?? asset.mimeType?.split('/').pop() ?? 'jpg';
            const extension = rawExtension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
            // Use a new path for every replacement so the browser never reuses a cached prior photo.
            const path = `${session.user.id}/host-photo-${Date.now()}.${extension}`;
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('host-profile-images')
        .upload(path, arrayBuffer, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase
        .from('host_profiles')
        .update({ profile_image_path: path })
        .eq('user_id', session.user.id);
      if (profileError) throw profileError;

      setDashboardData((current) => ({
        ...current,
        profile: current.profile
          ? { ...current.profile, profile_image_path: path }
          : current.profile,
      }));
    } catch (error) {
      Alert.alert(
        'Unable to upload photo',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsUploadingProfilePhoto(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.forest} size="large" />
          <Text style={styles.stateText}>Loading your host dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>We could not load hosting</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
          <Pressable onPress={() => void loadDashboard()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>

        </View>
      </SafeAreaView>
    );
  }

  if (!dashboardData.profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>Start your hosting journey</Text>
          <Text style={styles.stateText}>
            Complete your host profile first, then you can create and manage private spaces.
          </Text>
          <Pressable onPress={() => router.replace('/host')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Complete Host Profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeContent}>
            <Text style={styles.title}>Welcome, {firstName}</Text>
            <Text style={styles.description}>
              Keep your private spaces clear, welcoming, and ready for guests.
            </Text>
          </View>
          <View style={styles.photoColumn}>
            <Pressable
              accessibilityLabel="Change host photo"
              accessibilityRole="button"
              onPress={() => void uploadProfilePhoto()}
              style={styles.profilePhotoFrame}
            >
              <Image
                accessibilityLabel={profileImageUrl ? `${firstName}'s host photo` : 'Default ROVAH profile image'}
                source={profileImageUrl ? { uri: profileImageUrl } : require('../../assets/images/k9-11.png')}
                style={styles.profilePhoto}
              />
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/create-property')}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.primaryButtonText}>+ Add a Private Space</Text>
        </Pressable>

        {isAdministrator ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/admin')}
            style={({ pressed }) => [styles.adminButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.adminButtonText}>Administrator: Review Sites</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>Your properties</Text>
          <Text style={styles.sectionCount}>{dashboardData.properties.length}</Text>
        </View>

        {dashboardData.properties.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>Your first space starts here</Text>
            <Text style={styles.emptyCardText}>
              Add the basics, then complete photos, arrival details, amenities, rules, and availability.
            </Text>
          </View>
        ) : (
          dashboardData.properties.map((property) => (
            <View key={property.id} style={styles.propertyCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/property-draft/${property.id}` as never)}
                style={({ pressed }) => [styles.propertyMainAction, pressed && styles.buttonPressed]}
              >
                <View style={styles.propertyCardContent}>
                  <Text style={styles.propertyName}>{property.name}</Text>
                  <Text style={styles.propertyLocation}>
                    {property.city}, {property.state}
                  </Text>
                  <Text style={styles.propertyMeta}>
                    ${Number(property.price_per_hour).toFixed(0)} / hour{'  '}
                    {property.is_fully_fenced ? 'Fully fenced' : 'Fence details needed'}
                  </Text>
                  <Text style={styles.propertyAction}>Make Changes {'>'}</Text>
                </View>
                {property.is_published ? (
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>Live</Text>
                  </View>
                ) : null}
              </Pressable>

              <View style={styles.propertyTools}>
                <PropertyTool
                  icon={'\u{1F4CB}'}
                  label="Reservations"
                  onPress={() => router.push(`/host-reservations?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}&view=upcoming` as never)}
                />
                <PropertyTool
                  icon={'\u{1F4C5}'}
                  label="Calendar"
                  onPress={() => router.push(`/host-reservations?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}&view=calendar` as never)}
                />
                <PropertyTool
                  icon={'\u{1F4AC}'}
                  label="Guest Messages"
                  hasUnread={hasUnreadGuestMessages}
                  onPress={() => router.push('/host-messages')}
                />
                <PropertyTool
                  icon={'\u{2B50}'}
                  label="Site Reviews"
                  onPress={() => router.push(`/host-reviews?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}` as never)}
                />
                <PropertyTool
                  icon={'\u{1F465}'}
                  label="Guest Reviews"
                  onPress={() => router.push(`/host-reviews?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}&view=guest_records` as never)}
                />
              </View>
              <Pressable
                accessibilityLabel={`Message visitors of ${property.name}`}
                accessibilityRole="button"
                onPress={() => router.push(`/host-guest-message?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}` as never)}
                style={({ pressed }) => [styles.messageGuestsButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.messageGuestsButtonIcon}>📣</Text>
                <Text style={styles.messageGuestsButtonText}>Broadcast Message</Text>
              </Pressable>
              {property.is_published ? (
                <Pressable
                  accessibilityLabel={`Promote ${property.name}`}
                  accessibilityRole="button"
                  onPress={() => router.push(`/local-promotions?propertyId=${property.id}` as never)}
                  style={({ pressed }) => [styles.promotePropertyButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.promotePropertyButtonIcon}>✦</Text>
                  <View style={styles.promotePropertyCopy}>
                    <Text style={styles.promotePropertyButtonText}>Promote Your Spot</Text>
                    <Text style={styles.promotePropertyButtonDetail}>Reach nearby opted-in members for $2.00</Text>
                  </View>
                  <Text style={styles.promotePropertyArrow}>›</Text>
                </Pressable>
              ) : null}
              {property.is_published ? (
                <Pressable
                  accessibilityLabel={`Share ${property.name}`}
                  accessibilityRole="button"
                  onPress={() => void shareThisSite(property)}
                  style={({ pressed }) => [styles.sharePropertyButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.sharePropertyText}>Share this site</Text>
                  <View pointerEvents="none" style={styles.sharePropertyIcon}>
                    <View style={[styles.shareIconLine, styles.shareIconLineTop]} />
                    <View style={[styles.shareIconLine, styles.shareIconLineBottom]} />
                    <View style={[styles.shareIconDot, styles.shareIconDotOrigin]} />
                    <View style={[styles.shareIconDot, styles.shareIconDotTop]} />
                    <View style={[styles.shareIconDot, styles.shareIconDotBottom]} />
                  </View>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Earnings</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/host-payments')}
          style={({ pressed }) => [styles.earningsCard, pressed && styles.buttonPressed]}
        >
          <View>
            <Text style={styles.earningsLabel}>TOTAL HOST EARNINGS</Text>
            <Text style={styles.earningsValue}>$0.00</Text>
            <Text style={styles.earningsText}>
              Earnings from every property will be combined here.
            </Text>
          </View>
          <Text style={styles.earningsAction}>View payouts {'>'}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Analytics</Text>
        {dashboardData.properties.length === 0 ? (
          <View style={styles.analyticsEmptyCard}>
            <Text style={styles.analyticsEmptyText}>
              Add a private space to begin tracking clicks and bookings.
            </Text>
          </View>
        ) : (
          dashboardData.properties.map((property) => {
            const viewCount = property.view_count ?? 0;
            const bookingCount = property.booking_count ?? 0;
            const averageHostEarnings = bookingCount ? (property.booking_total * 0.82) / bookingCount : 0;
            const conversionText = viewCount > 0
              ? `${Math.round((bookingCount / viewCount) * 100)}% of clicks became bookings`
              : 'Clicks will appear here once guests open your listing';

            return (
              <Pressable accessibilityRole="button" key={`analytics-${property.id}`} onPress={() => router.push(`/host-analytics?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}` as never)} style={({ pressed }) => [styles.propertyAnalyticsCard, pressed && styles.buttonPressed]}>
                <Text style={styles.propertyAnalyticsName}>{property.name}</Text>
                <View style={styles.propertyAnalyticsRow}>
                  <View style={styles.analyticsMetricBlock}>
                    <Text style={styles.analyticsMetricValue}>{viewCount}</Text>
                    <Text style={styles.analyticsMetricLabel}>Clicks</Text>
                  </View>
                  <View style={styles.analyticsMetricBlock}>
                    <Text style={styles.analyticsMetricValue}>{bookingCount}</Text>
                    <Text style={styles.analyticsMetricLabel}>Bookings</Text>
                  </View>
                  <View style={styles.analyticsMetricBlock}>
                    <Text style={styles.analyticsMetricValue}>${averageHostEarnings.toFixed(0)}</Text>
                    <Text style={styles.analyticsMetricLabel}>Avg. host earnings</Text>
                  </View>
                </View>
                <Text style={styles.analyticsHint}>{conversionText}</Text>
                <Text style={styles.analyticsAction}>View detailed analytics</Text>
              </Pressable>
            );
          })
        )}

        <View style={styles.hostGuide}>
          <Text style={styles.hostGuideTitle}>How to use your Host Dashboard</Text>
          <Text style={styles.hostGuideIntro}>Use these steps to create, manage, and grow a private space guests feel confident booking.</Text>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>1</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Set up your property</Text>
              <Text style={styles.hostGuideStepText}>Add the property basics, at least one clear property photo, arrival details, rules, amenities, and availability.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>2</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Submit for ROVAH review</Text>
              <Text style={styles.hostGuideStepText}>When all required details are complete, submit your property for review. It becomes visible to members only after approval.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>3</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Manage reservations and guests</Text>
              <Text style={styles.hostGuideStepText}>Open any confirmed reservation to review the visiting dogs, message that guest, or cancel an upcoming reservation when needed.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>4</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Keep your listing current</Text>
              <Text style={styles.hostGuideStepText}>Update photos, hours, rules, amenities, standard rate, and any Subscription offer whenever your property changes.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>5</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Send a gift in Messages</Text>
              <Text style={styles.hostGuideStepText}>During a private conversation, use Gift to send a one-time Special Discount or Courtesy Visit for that specific site. The guest sees it immediately and can apply it to their next reservation.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>6</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Use messages and analytics to improve</Text>
              <Text style={styles.hostGuideStepText}>Reply to guest messages, send a site broadcast when appropriate, and review clicks, bookings, and average host earnings to improve your listing.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>7</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Prepare a local promotion</Text>
              <Text style={styles.hostGuideStepText}>Use Promote Your Spot to choose a published property, customize a message, preview it, and save a private draft. Secure Stripe payment, nearby-member matching, and delivery will be available here once promotion payments are connected.</Text>
            </View>
          </View>
        </View>

        <View style={styles.accountSection}>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
          <Text style={styles.accountEmail}>{session?.user.email}</Text>

          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.buttonPressed,
              isSigningOut && styles.buttonDisabled,
            ]}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#8A4F17" />
            ) : (
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/trust-safety' as never)}
          style={styles.trustSafetyLink}
        >
          <Text style={styles.trustSafetyLinkTitle}>Trust & Safety</Text>
          <Text style={styles.trustSafetyLinkText}>How ROVAH helps keep every visit safe</Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/pricing' as never)}
          style={[styles.trustSafetyLink, styles.pricingLink]}
        >
          <Text style={styles.trustSafetyLinkTitle}>Pricing</Text>
          <Text style={styles.trustSafetyLinkText}>Simple, fair, transparent pricing for members and hosts</Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/privacy' as never)}
          style={[styles.trustSafetyLink, styles.privacyLink]}
        >
          <Text style={styles.trustSafetyLinkTitle}>Privacy Policy</Text>
          <Text style={styles.trustSafetyLinkText}>How ROVAH collects, uses, and protects your information</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

function PropertyTool({
  icon,
  label,
  hasUnread = false,
  onPress,
}: {
  icon: string;
  label: string;
  hasUnread?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.propertyTool, pressed && styles.buttonPressed]}
    >
      {label === 'Guest Messages' ? (
        <UnreadMessageIcon hasUnread={hasUnread} size="small" />
      ) : (
        <Text style={styles.propertyToolIcon}>{icon}</Text>
      )}
      <Text style={styles.propertyToolLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginBottom: 7 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', lineHeight: 36, marginBottom: 10 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 20 },
  welcomeRow: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 12 },
  welcomeContent: { flex: 1, paddingRight: 12 },
  photoColumn: { alignItems: 'center', width: 118 },
  profilePhotoFrame: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: colors.brown, borderRadius: 48, borderWidth: 2, height: 96, justifyContent: 'center', overflow: 'hidden', width: 96 },
  profilePhoto: { height: '100%', width: '100%' },
  stateTitle: { color: colors.forest, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 4, minHeight: 56, paddingHorizontal: 20 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  adminButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 48, paddingHorizontal: 20 },
  adminButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 54, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  buttonPressed: { opacity: 0.76 },
  buttonDisabled: { opacity: 0.55 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 28 },
  sectionTitle: { color: colors.forest, fontSize: 21, fontWeight: '900', marginTop: 28, marginBottom: 12 },
  sectionTitleNoMargin: { color: colors.forest, fontSize: 21, fontWeight: '900' },
  sectionCount: { backgroundColor: colors.lightGreen, borderRadius: 14, color: colors.olive, fontSize: 13, fontWeight: '900', minWidth: 29, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, textAlign: 'center' },
  emptyCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, padding: 18 },
  emptyCardTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginBottom: 6 },
  emptyCardText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  propertyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  propertyMainAction: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  propertyCardContent: { flex: 1, paddingRight: 12 },
  propertyName: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  propertyLocation: { color: colors.muted, fontSize: 14, marginTop: 4 },
  propertyMeta: { color: colors.olive, fontSize: 13, fontWeight: '700', marginTop: 9 },
  propertyAction: { color: colors.brown, fontSize: 13, fontWeight: '900', marginTop: 12 },
  propertyTools: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row' },
  propertyTool: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 78, paddingHorizontal: 3 },
  propertyToolIcon: { fontSize: 20 },
  propertyToolLabel: { color: colors.forest, fontSize: 11, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  messageGuestsButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginBottom: 5, marginHorizontal: 15, marginTop: 7, minHeight: 52 },
  messageGuestsButtonIcon: { fontSize: 18, marginRight: 8 },
  messageGuestsButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  promotePropertyButton: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginHorizontal: 15, marginTop: 10, minHeight: 70, paddingHorizontal: 14 },
  promotePropertyButtonIcon: { color: colors.brown, fontSize: 23, marginRight: 10 },
  promotePropertyCopy: { flex: 1 },
  promotePropertyButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  promotePropertyButtonDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  promotePropertyArrow: { color: colors.brown, fontSize: 28, fontWeight: '600' },
  sharePropertyButton: { alignItems: 'center', backgroundColor: colors.forest, borderColor: colors.forest, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginBottom: 15, marginHorizontal: 15, marginTop: 12, minHeight: 52 },
  sharePropertyIcon: { height: 22, marginLeft: 10, position: 'relative', width: 22 },
  shareIconLine: { backgroundColor: colors.warmWhite, height: 2, left: 5, position: 'absolute', width: 13 },
  shareIconLineTop: { top: 7, transform: [{ rotate: '-27deg' }] },
  shareIconLineBottom: { top: 14, transform: [{ rotate: '27deg' }] },
  shareIconDot: { backgroundColor: colors.warmWhite, borderRadius: 4, height: 7, position: 'absolute', width: 7 },
  shareIconDotOrigin: { left: 0, top: 8 },
  shareIconDotTop: { right: 0, top: 1 },
  shareIconDotBottom: { bottom: 1, right: 0 },
  sharePropertyText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' },
  earningsCard: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 18 },
  earningsLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  earningsValue: { color: colors.forest, fontSize: 28, fontWeight: '900', marginTop: 5 },
  earningsText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 210 },
  earningsAction: { color: colors.brown, fontSize: 13, fontWeight: '900', paddingLeft: 12 },
  analyticsEmptyCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 16, borderWidth: 1, padding: 15 },
  analyticsEmptyText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  propertyAnalyticsCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginBottom: 10, padding: 15 },
  propertyAnalyticsName: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  propertyAnalyticsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  analyticsMetricBlock: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 },
  analyticsMetricValue: { color: colors.forest, fontSize: 22, fontWeight: '900' },
  analyticsMetricLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  analyticsHint: { color: colors.olive, fontSize: 13, lineHeight: 18, marginTop: 10, fontWeight: '700' },
  analyticsAction: { color: colors.brown, fontSize: 13, fontWeight: '900', marginTop: 12, textDecorationLine: 'underline' },
  hostGuide: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 17 },
  hostGuideTitle: { color: colors.forest, fontSize: 19, fontWeight: '900' },
  hostGuideIntro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  hostGuideStep: { flexDirection: 'row', marginTop: 16 },
  hostGuideNumber: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 13, fontWeight: '900', height: 26, lineHeight: 24, marginRight: 10, textAlign: 'center', width: 26 },
  hostGuideCopy: { flex: 1 },
  hostGuideStepTitle: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  hostGuideStepText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  propertyMetric: { flex: 1 },
  propertyMetricValue: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  propertyMetricLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 3 },
  liveBadge: { backgroundColor: colors.lightGreen, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  liveBadgeText: { color: colors.olive, fontSize: 12, fontWeight: '900' },
  mainEntryLink: { alignItems: 'center', justifyContent: 'center', marginTop: 28, minHeight: 46 },
  mainEntryLinkText: { color: colors.brown, fontSize: 14, fontWeight: '900', textDecorationLine: 'underline' },
  trustSafetyLink: { alignItems: 'center', marginTop: 28, paddingHorizontal: 20, paddingVertical: 12 },
  pricingLink: { marginTop: 6 },
  privacyLink: { marginTop: 6 },
  trustSafetyLinkTitle: { color: colors.forest, fontSize: 15, fontWeight: '900', textDecorationLine: 'underline' },
  trustSafetyLinkText: { color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  accountSection: { alignItems: 'center', marginTop: 30 },
  accountLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  accountEmail: { color: colors.forest, fontSize: 14, marginTop: 5, marginBottom: 12 },
  signOutButton: { alignItems: 'center', justifyContent: 'center', borderColor: colors.brown, borderRadius: 12, borderWidth: 1, minHeight: 46, minWidth: 130, paddingHorizontal: 22 },
  signOutButtonText: { color: colors.brown, fontSize: 15, fontWeight: '800' },
});
