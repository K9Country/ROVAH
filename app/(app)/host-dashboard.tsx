import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UnreadMessageIcon } from '../../components/unread-message-icon';
import { colors, shadows } from '../../constants/theme';
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
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

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
      ]);

    let [profileResult, propertiesResult] =
      await loadHostingRecords();

    const initialError = profileResult.error ?? propertiesResult.error;
    if (isJwtIssuedInFutureError(initialError)) {
      const { error: refreshError } = await supabase.auth.refreshSession();

      if (!refreshError) {
        [profileResult, propertiesResult] =
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

  useEffect(() => {
    setSelectedPropertyId((current) =>
      current && dashboardData.properties.some((property) => property.id === current)
        ? current
        : dashboardData.properties[0]?.id ?? null
    );
  }, [dashboardData.properties]);

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
  const selectedProperty = dashboardData.properties.find((property) => property.id === selectedPropertyId) ?? null;
  const payoutReady = dashboardData.profile?.payout_status === 'active';

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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoMargin}>Your sites</Text>
        </View>

        {dashboardData.properties.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>Your first space starts here</Text>
            <Text style={styles.emptyCardText}>
              Add the basics, then complete photos, arrival details, amenities, rules, and availability.
            </Text>
          </View>
        ) : (
          <>
            {dashboardData.properties.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.siteSwitcher}>
                {dashboardData.properties.map((property) => (
                  <Pressable
                    accessibilityRole="button"
                    key={`site-${property.id}`}
                    onPress={() => setSelectedPropertyId(property.id)}
                    style={[styles.siteSwitchButton, selectedProperty?.id === property.id && styles.siteSwitchButtonSelected]}
                  >
                    <Text numberOfLines={1} style={[styles.siteSwitchText, selectedProperty?.id === property.id && styles.siteSwitchTextSelected]}>{property.name}</Text>
                    <SiteStatusBadge compact property={property} payoutReady={payoutReady} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          {dashboardData.properties.map((property) => property.id !== selectedProperty?.id ? null : (
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
                </View>
                <SiteStatusBadge property={property} payoutReady={payoutReady} />
              </Pressable>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionEyebrow}>GROW YOUR SITE</Text>
                <Text style={styles.dashboardSectionTitle}>Build a Stronger Listing</Text>
                <DashboardAction icon="✦" label="Get Discovered" detail="Share a $2.00 site message with eligible new local members." onPress={() => router.push(`/local-promotions?propertyId=${property.id}` as never)} />
                <DashboardAction icon="↻" label="Subscriptions" detail="Create, modify, or end repeat-visit packages for this site." onPress={() => router.push(`/subscriptions/${property.id}` as never)} />
                <DashboardAction icon="★" label="Make Your Site Stand Out" detail="Keep the listing, photos, and guest feedback current." onPress={() => router.push(`/property-draft/${property.id}` as never)} />
                <DashboardAction icon="↗" label="Communicate With Your Guest" detail="Send a site-only broadcast to guests connected to this private space." onPress={() => router.push(`/host-guest-message?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}` as never)} />
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionEyebrow}>MANAGE YOUR SITE</Text>
                <Text style={styles.dashboardSectionTitle}>These tools stay connected to {property.name} only.</Text>
              <View style={styles.propertyTools}>
                <PropertyTool
                  icon={'\u{1F4C5}'}
                  label="Reservations"
                  detail="View upcoming visits, completed visits, and your site schedule."
                  onPress={() => router.push(`/host-reservations?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}&view=upcoming` as never)}
                />
                <PropertyTool
                  icon={'\u{1F4AC}'}
                  label="Messages"
                  detail="Communicate with guests"
                  hasUnread={hasUnreadGuestMessages}
                  onPress={() => router.push(`/host-messages?propertyId=${property.id}` as never)}
                />
                <PropertyTool
                  icon={'\u{2B50}'}
                  label="Site Reviews"
                  detail="Read guest feedback about this private space."
                  onPress={() => router.push(`/host-reviews?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}` as never)}
                />
                <PropertyTool
                  icon={'\u{1F465}'}
                  label="Guest Reviews"
                  detail="Review completed guests and view feedback shared by other hosts."
                  onPress={() => router.push(`/host-reviews?propertyId=${property.id}&propertyName=${encodeURIComponent(property.name)}&view=guest_records` as never)}
                />
              </View>
              </View>
              {false && property.is_published ? (
                <Pressable
                  accessibilityLabel={`Promote ${property.name}`}
                  accessibilityRole="button"
                  onPress={() => router.push(`/local-promotions?propertyId=${property.id}` as never)}
                  style={({ pressed }) => [styles.promotePropertyButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.promotePropertyButtonIcon}>✦</Text>
                  <View style={styles.promotePropertyCopy}>
                    <Text style={styles.promotePropertyButtonText}>Promote Your Spot</Text>
                    <Text style={styles.promotePropertyButtonDetail}>Reach eligible members within 50 miles for $2.00</Text>
                  </View>
                  <Text style={styles.promotePropertyArrow}>›</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          </>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/create-property')}
          style={({ pressed }) => [styles.primaryButton, styles.addPrivateSpaceButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.primaryButtonText}>+ Add a Private Space</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/host-payments')}
          style={({ pressed }) => [styles.payoutSetupCard, pressed && styles.buttonPressed]}
        >
          <View style={styles.payoutSetupCopy}>
            <Text style={styles.payoutSetupEyebrow}>CONTINUE TO GROW YOUR INCOME</Text>
            <Text style={styles.payoutSetupTitle}>{payoutReady ? 'Stripe payouts are ready' : 'Set Up Stripe Payouts'}</Text>
            <Text style={styles.payoutSetupText}>
              {payoutReady
                ? 'Your secure payout account is connected. Approved sites can accept paid reservations.'
                : 'Complete secure Stripe setup to receive money from reservations. ROVAH never stores your bank or tax details.'}
            </Text>
          </View>
          <Text style={styles.payoutSetupArrow}>›</Text>
        </Pressable>

        <View style={styles.reviewNotice}>
          <Text style={styles.reviewNoticeTitle}>When a site can go live</Text>
          <Text style={styles.reviewNoticeText}>A private space stays unavailable for reservations until a ROVAH administrator approves it and Stripe payouts are ready.</Text>
        </View>

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
          dashboardData.properties.filter((property) => property.id === selectedProperty?.id).map((property) => {
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
          <Text style={styles.hostGuideIntro}>Use this dashboard to manage the selected site, prepare it for guests, and choose your next action.</Text>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>1</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Set up your property</Text>
              <Text style={styles.hostGuideStepText}>Add the basics, clear site photos, arrival details, rules, amenities, and available hours.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>2</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Submit for ROVAH review</Text>
              <Text style={styles.hostGuideStepText}>Save the required details, then submit the site for ROVAH review. A site becomes live only after ROVAH approval and secure Stripe payouts are ready.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>3</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Upcoming visitors</Text>
              <Text style={styles.hostGuideStepText}>Open Reservations to review upcoming visits, attending dogs, arrival details, and the site schedule. Payment Pending means the reservation is secured and payment will settle one hour before the visit begins.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>4</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Previous visitors</Text>
              <Text style={styles.hostGuideStepText}>After a completed visit, use Guest Reviews to review the guest and see feedback shared by other hosts. Use Site Reviews to read feedback the guest left about this private space.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>5</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Keep your listing current</Text>
              <Text style={styles.hostGuideStepText}>Use Make Your Site Stand Out to update photos, hours, rules, amenities, rate, and listing details.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>6</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Offer a Special / Gift when needed</Text>
              <Text style={styles.hostGuideStepText}>In Messages, choose Special / Gift to send a site-specific Special Discount or Courtesy Waiver to one guest.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>7</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Use messages and analytics to improve</Text>
              <Text style={styles.hostGuideStepText}>Reply in Messages, use Communicate With Your Guest for site updates, and review analytics to improve the listing.</Text>
            </View>
          </View>
          <View style={styles.hostGuideStep}>
            <Text style={styles.hostGuideNumber}>8</Text>
            <View style={styles.hostGuideCopy}>
              <Text style={styles.hostGuideStepTitle}>Reach new local members</Text>
              <Text style={styles.hostGuideStepText}>Use Get Discovered to review the eligible 50-mile audience and message, then confirm the $2 promotion for the selected site.</Text>
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
          onPress={() => router.push('/legal' as never)}
          style={styles.trustSafetyLink}
        >
          <Text style={styles.trustSafetyLinkTitle}>Legal Library</Text>
          <Text style={styles.trustSafetyLinkText}>Terms, privacy, safety, pricing, and marketplace policies</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

function getSiteStatus(property: Property, payoutReady: boolean) {
  if (property.approval_status === 'draft') {
    return { label: 'Draft', tone: 'inactive' as const };
  }

  if (property.approval_status === 'pending') {
    return { label: 'Submitted for Review', tone: 'pending' as const };
  }

  if (property.approval_status === 'declined') {
    return { label: 'Changes Requested', tone: 'inactive' as const };
  }

  if (property.approval_status === 'approved' && !payoutReady) {
    return { label: 'Payout Setup Needed', tone: 'pending' as const };
  }

  if (property.is_published && !property.is_temporarily_closed) {
    return { label: 'Live', tone: 'live' as const };
  }

  return { label: 'Inactive', tone: 'inactive' as const };
}

function SiteStatusBadge({ property, compact = false, payoutReady }: { property: Property; compact?: boolean; payoutReady: boolean }) {
  const status = getSiteStatus(property, payoutReady);

  return (
    <View accessibilityLabel={`Site status: ${status.label}`} style={[styles.siteStatusBadge, compact && styles.siteStatusBadgeCompact, status.tone === 'live' ? styles.siteStatusLive : status.tone === 'pending' ? styles.siteStatusPending : styles.siteStatusInactive]}>
      <Text style={[styles.siteStatusText, compact && styles.siteStatusTextCompact]}>{status.label}</Text>
    </View>
  );
}

function PropertyTool({
  icon,
  label,
  detail,
  hasUnread = false,
  onPress,
}: {
  icon: string;
  label: string;
  detail: string;
  hasUnread?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.propertyTool, pressed && styles.buttonPressed]}
    >
      <View style={styles.propertyToolIconWrap}>
        {label === 'Guest Messages' || label === 'Messages' ? (
          <UnreadMessageIcon hasUnread={hasUnread} size="small" />
        ) : (
          <Text style={styles.propertyToolIcon}>{icon}</Text>
        )}
      </View>
      <View style={styles.propertyToolCopy}>
        <Text style={styles.propertyToolLabel}>{label}</Text>
        <Text style={styles.propertyToolDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function DashboardAction({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: string;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.growthAction, pressed && styles.buttonPressed]}>
      <Text style={styles.growthActionIcon}>{icon}</Text>
      <View style={styles.growthActionCopy}>
        <Text style={styles.growthActionLabel}>{label}</Text>
        <Text style={styles.growthActionDetail}>{detail}</Text>
      </View>
      <Text style={styles.growthActionArrow}>›</Text>
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
  addPrivateSpaceButton: { marginTop: 24 },
  payoutSetupCard: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 18, flexDirection: 'row', marginTop: 5, padding: 17 },
  payoutSetupCopy: { flex: 1, paddingRight: 12 },
  payoutSetupEyebrow: { color: '#D8E8C8', fontSize: 10, fontWeight: '900', letterSpacing: 1.05 },
  payoutSetupTitle: { color: colors.warmWhite, fontSize: 18, fontWeight: '900', marginTop: 5 },
  payoutSetupText: { color: '#EEF5E9', fontSize: 13, lineHeight: 19, marginTop: 5 },
  payoutSetupArrow: { color: colors.warmWhite, fontSize: 30, fontWeight: '600' },
  reviewNotice: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 14, borderWidth: 1, marginTop: 8, padding: 14 },
  reviewNoticeTitle: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  reviewNoticeText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  sectionHeader: { marginBottom: 12, marginTop: 18 },
  sectionTitle: { color: colors.forest, fontSize: 21, fontWeight: '900', marginTop: 28, marginBottom: 12 },
  sectionTitleNoMargin: { color: colors.forest, fontSize: 21, fontWeight: '900' },
  siteSwitcher: { gap: 8, paddingBottom: 12 },
  siteSwitchButton: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 999, borderWidth: 1, maxWidth: 180, minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
  siteSwitchButtonSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  siteSwitchText: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  siteSwitchTextSelected: { color: colors.warmWhite },
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
  dashboardSection: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 16 },
  dashboardSectionEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginHorizontal: 16 },
  dashboardSectionTitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginHorizontal: 16, marginTop: 5, marginBottom: 10 },
  growthAction: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', minHeight: 62, paddingHorizontal: 16 },
  growthActionIcon: { color: colors.brown, fontSize: 19, marginRight: 11, width: 21 },
  growthActionCopy: { flex: 1 },
  growthActionLabel: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  growthActionDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  growthActionArrow: { color: colors.brown, fontSize: 23, fontWeight: '700', marginLeft: 10 },
  propertyTools: { borderTopColor: colors.border, borderTopWidth: 1, gap: 10, padding: 14 },
  propertyTool: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', minHeight: 92, paddingHorizontal: 15, paddingVertical: 14, ...shadows.card },
  propertyToolIconWrap: { alignItems: 'center', justifyContent: 'center', marginRight: 13, minHeight: 34, minWidth: 34 },
  propertyToolIcon: { fontSize: 27 },
  propertyToolCopy: { flex: 1 },
  propertyToolLabel: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  propertyToolDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  messageGuestsButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginBottom: 5, marginHorizontal: 15, marginTop: 7, minHeight: 52 },
  messageGuestsButtonIcon: { fontSize: 18, marginRight: 8 },
  messageGuestsButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  promotePropertyButton: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginHorizontal: 15, marginTop: 10, minHeight: 70, paddingHorizontal: 14 },
  promotePropertyButtonIcon: { color: colors.brown, fontSize: 23, marginRight: 10 },
  promotePropertyCopy: { flex: 1 },
  promotePropertyButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  promotePropertyButtonDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  promotePropertyArrow: { color: colors.brown, fontSize: 28, fontWeight: '600' },
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
  siteStatusBadge: { alignSelf: 'flex-start', borderRadius: 999, marginTop: 10, paddingHorizontal: 9, paddingVertical: 5 },
  siteStatusBadgeCompact: { alignSelf: 'center', marginTop: 4, paddingHorizontal: 7, paddingVertical: 3 },
  siteStatusLive: { backgroundColor: '#DFF4E4' },
  siteStatusPending: { backgroundColor: '#FFF0D1' },
  siteStatusInactive: { backgroundColor: '#E4E5E2' },
  siteStatusText: { color: colors.forest, fontSize: 11, fontWeight: '900' },
  siteStatusTextCompact: { fontSize: 9 },
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
