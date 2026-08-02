import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
 
import { UnreadMessageIcon } from '../../components/unread-message-icon';
import { HostFeedbackButton } from '../../components/host-feedback-button';
import { SiteReviewsButton } from '../../components/site-reviews-button';
import { colors, shadows, typography } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { HostPageGuide } from '../../components/host-page-guide';
import { getUnreadConversationIds } from '../../lib/messaging';
import { clearExplicitMemberSignOut, markExplicitMemberSignOut } from '../../lib/member-entry';
import { supabase } from '../../lib/supabase';
import { getPendingSiteReviews } from '../../lib/site-reviews';
import { useAuth } from '../../services/auth-context';
import type { PropertyConversation } from '../../types/messaging';
 
type DashboardAction = {
  title: string;
  description: string;
  icon: string;
  route?: string;
};

type MemoryPhoto = {
  path: string;
  url: string;
};
type SubscriptionPass = { id: string; property_id: string; credit_hours_total: number; credit_hours_remaining: number; expires_at: string; properties: { name: string } | null };
 
const dashboardActions: DashboardAction[] = [
{
  title: 'Book Your Reservation',
  description: 'Search private properties near you.',
  icon: '🔍',
  route: '/search',
},
  {
    title: 'Followed Sites',
    description: 'Return to private spaces you follow.',
    icon: '✓',
    route: '/favorites',
  },
  {
    title: 'My Reservations',
    description: 'View upcoming and previous visits.',
    icon: '📅',
    route: '/reservations',
  },
  {
    title: 'Messages',
    description: 'Communicate with property hosts.',
    icon: '💬',
    route: '/messages',
  },
  {
    title: 'Parent Profile',
    description: 'Manage your account and preferences.',
    icon: '⚙',
    route: '/profile',
  },
  {
    title: 'Dog Profiles',
    description: 'Add and manage profiles for your dogs.',
    icon: '🐾',
    route: '/dog-profiles',
  },
  {
    title: 'Everything Dogs',
    description: 'Explore helpful resources, services, and must-haves for your dog.',
    icon: '🐶',
    route: '/everything-dogs',
  },
];
 
export default function DashboardScreen() {
  const { session } = useAuth();
  const { profileSaved } = useLocalSearchParams<{ profileSaved?: string }>();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [hasUnreadHostFeedback, setHasUnreadHostFeedback] = useState(false);
  const [hasPendingSiteReviews, setHasPendingSiteReviews] = useState(false);
  const [memories, setMemories] = useState<MemoryPhoto[]>([]);

  const [hasLoadedMemories, setHasLoadedMemories] = useState(false);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [isUploadingMemories, setIsUploadingMemories] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState('');
  const [subscriptionPasses, setSubscriptionPasses] = useState<SubscriptionPass[]>([]);

  const loadSubscriptionPasses = useCallback(async () => {
    if (!session?.user.id) { setSubscriptionPasses([]); return; }
    const { data } = await supabase.from('member_loyalty_passes')
      .select('id, property_id, credit_hours_total, credit_hours_remaining, expires_at, properties(name)')
      .eq('member_id', session.user.id)
      .eq('status', 'active').gt('credit_hours_remaining', 0).gt('expires_at', new Date().toISOString());
    setSubscriptionPasses((data ?? []).map((pass) => ({ ...pass, properties: Array.isArray(pass.properties) ? pass.properties[0] ?? null : pass.properties })) as SubscriptionPass[]);
  }, [session?.user.id]);

  const loadUnreadMessages = useCallback(async () => {
    if (!session?.user.id) {
      setHasUnreadMessages(false);
      return;
    }

    const { data } = await supabase
      .from('property_conversations')
      .select('*')
      .eq('guest_id', session.user.id);
    const unreadConversationIds = await getUnreadConversationIds(
      (data ?? []) as PropertyConversation[],
      session.user.id
    );
    setHasUnreadMessages(unreadConversationIds.size > 0);
  }, [session?.user.id]);

  const loadMemories = useCallback(async () => {
    if (!session?.user.id) {
      setMemories([]);
      setIsLoadingMemories(false);
      setHasLoadedMemories(true);
      return;
    }

    setIsLoadingMemories(true);
    setMemoryStatus('');

    try {
      const { data: files, error: listError } = await supabase.storage
        .from('guest-memories')
        .list(session.user.id, { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });

      if (listError) {
        setMemoryStatus('We could not load your memories.');
        return;
      }

      const paths = (files ?? [])
        .filter((file) => file.name)
        .map((file) => `${session.user.id}/${file.name}`);

      if (!paths.length) {
        setMemories([]);
        return;
      }

      const { data: signedUrls, error: signedUrlError } = await supabase.storage
        .from('guest-memories')
        .createSignedUrls(paths, 60 * 60);

      if (signedUrlError) {
        setMemoryStatus('We could not load your memories.');
        return;
      }

      setMemories(
        (signedUrls ?? [])
          .map((file, index) => ({ path: paths[index], url: file.signedUrl }))
          .filter((file): file is MemoryPhoto => Boolean(file.url))
      );
    } catch {
      setMemoryStatus('We could not load your memories.');
    } finally {
      setHasLoadedMemories(true);
      setIsLoadingMemories(false);
    }
  }, [session?.user.id]);

  const loadUnreadHostFeedback = useCallback(async () => {
    if (!session?.user.id) {
      setHasUnreadHostFeedback(false);
      return;
    }

    const { data } = await supabase
      .from('booking_reviews')
      .select('id')
      .eq('reviewee_id', session.user.id)
      .eq('review_type', 'host_to_guest')
      .is('guest_feedback_viewed_at', null)
      .limit(1);
    setHasUnreadHostFeedback((data?.length ?? 0) > 0);
  }, [session?.user.id]);

  const loadPendingSiteReviews = useCallback(async () => {
    if (!session?.user.id) {
      setHasPendingSiteReviews(false);
      return;
    }

    try {
      const pendingReviews = await getPendingSiteReviews(session.user.id);
      setHasPendingSiteReviews(pendingReviews.length > 0);
    } catch {
      // The dedicated screen gives a useful retry message. The dashboard must
      // not show a false red work-to-do alert if its read fails.
      setHasPendingSiteReviews(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    void loadUnreadMessages();
    void loadUnreadHostFeedback();
    void loadPendingSiteReviews();
    void loadSubscriptionPasses();
    const refreshInterval = setInterval(
      () => {
        void loadUnreadMessages();
        void loadUnreadHostFeedback();
        void loadPendingSiteReviews();
        void loadSubscriptionPasses();
      },
      15_000
    );
    return () => clearInterval(refreshInterval);
  }, [loadPendingSiteReviews, loadSubscriptionPasses, loadUnreadHostFeedback, loadUnreadMessages]);

  useFocusEffect(useCallback(() => {
    void loadPendingSiteReviews();
    void loadSubscriptionPasses();
  }, [loadPendingSiteReviews, loadSubscriptionPasses]));

  const handleNavigation = (route: string) => {
    router.push(route as never);
  };

  const uploadMemories = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!session?.user.id || !assets.length) return;

    try {
      setIsUploadingMemories(true);
      await Promise.all(
        assets.map(async (asset, index) => {
          const extension = (asset.mimeType?.split('/')[1] ?? 'jpg')
            .replace('jpeg', 'jpg')
            .replace(/[^a-z0-9]/gi, '');
          const path = `${session.user.id}/${Date.now()}-${index}.${extension || 'jpg'}`;
          const response = await fetch(asset.uri);
          const { error } = await supabase.storage
            .from('guest-memories')
            .upload(path, await response.arrayBuffer(), {
              contentType: asset.mimeType ?? 'image/jpeg',
              upsert: false,
            });
          if (error) throw error;
        })
      );
      await loadMemories();
    } catch {
      setMemoryStatus('We could not upload those photos. Please try again.');
    } finally {
      setIsUploadingMemories(false);
    }
  };

  const addMemories = async () => {
    setMemoryStatus('');
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.8,
      selectionLimit: 10,
    });
    if (!result.canceled) await uploadMemories(result.assets);
  };

  const takeMemoryPhoto = async () => {
    if (!session?.user.id || isUploadingMemories) return;

    setMemoryStatus('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMemoryStatus('Camera permission is needed to take a memory photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) await uploadMemories(result.assets);
  };

  const memberActions = dashboardActions.slice(1);
 
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);

      await markExplicitMemberSignOut();
 
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        await clearExplicitMemberSignOut();
        Alert.alert('Unable to sign out', error.message);
        return;
      }
 
      router.dismissAll();
      router.replace('/choose-path');
    } catch {
      await clearExplicitMemberSignOut();
      Alert.alert(
        'Something went wrong',
        'We could not sign you out. Please try again.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };
 
  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image
            accessibilityLabel="ROVAH private places, lasting memories, freedom for dogs"
            resizeMode="contain"
            source={require('../../assets/images/rovah-member-dashboard-hero.png')}
            style={styles.k9HeaderImage}
          />
        </View>

        <View style={styles.dashboardContent}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Book Your Reservation"
          onPress={() => handleNavigation('/search')}
          style={({ pressed }) => [
            styles.featureCard,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Book Your Reservation</Text>
            <Text style={styles.featureDescription}>
              Discover secure outdoor properties where your family and dog can relax without crowds or unfamiliar dogs.
            </Text>
            <Text style={styles.featureLink}>Search properties →</Text>
          </View>
        </Pressable>

        {subscriptionPasses.map((pass) => (
          <Pressable key={pass.id} accessibilityRole="button" onPress={() => handleNavigation(`/property/${pass.property_id}`)} style={styles.subscriptionCard}>
            <Text style={styles.subscriptionEyebrow}>SUBSCRIPTION VISITS REMAINING</Text>
            <Text style={styles.subscriptionSite}>{pass.properties?.name ?? 'Your private space'}</Text>
            <Text style={styles.subscriptionCount}>{Number(pass.credit_hours_remaining)} of {Number(pass.credit_hours_total)} visits remaining</Text>
            <Text style={styles.subscriptionNote}>Subscription reservations use 1 visit credit. $0 due.</Text>
          </Pressable>
        ))}

        <View style={styles.grid}>
          {memberActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.title}
              onPress={() => action.route && handleNavigation(action.route)}
              style={({ pressed }) => [
                styles.actionCard,
                action.title === 'Everything Dogs' && styles.everythingDogsActionCard,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.actionStack}>
                <View style={styles.actionIconSlot}>
                  {action.title === 'Messages' ? (
                    <UnreadMessageIcon
                      hasUnread={hasUnreadMessages}
                      size="small"
                      style={styles.actionMessageIcon}
                    />
                  ) : action.title === 'Dog Profiles' ? (
                    <Image
                      accessibilityLabel="Dog Profiles"
                      resizeMode="contain"
                      source={require('../../assets/images/member-sign-in-paw.png')}
                      style={styles.dogProfilesActionPaw}
                    />
                  ) : action.title === 'Everything Dogs' ? (
                    <Image
                      accessibilityLabel="Everything Dogs"
                      resizeMode="contain"
                      source={require('../../assets/images/k9-everything-dogs-dashboard-icon.png')}
                      style={styles.everythingDogsImage}
                    />
                  ) : (
                    <Text style={[styles.actionIcon, action.title === 'Followed Sites' && styles.favoriteActionIcon]}>{action.icon}</Text>
                  )}
                </View>

                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionDescription}>{action.description}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.memoriesSection}>
          <View style={styles.memoriesHeader}>
            <View style={styles.memoriesCopy}>
              <Text style={styles.memoriesTitle}>Memories</Text>
              <Text style={styles.memoriesDescription}>Keep favorite moments from visits with your pet.</Text>
            </View>
            <Pressable
              accessibilityLabel="Upload memory photos"
              accessibilityRole="button"
              disabled={isUploadingMemories}
              onPress={() => void addMemories()}
              style={[styles.uploadMemoriesButton, isUploadingMemories && styles.buttonDisabled]}
            >
              {isUploadingMemories ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.uploadMemoriesButtonText}>+ Upload</Text>}
            </Pressable>
            <Pressable
              accessibilityHint="Opens your camera so you can take and upload a memory photo"
              accessibilityLabel="Take a memory photo"
              accessibilityRole="button"
              disabled={isUploadingMemories}
              onPress={() => void takeMemoryPhoto()}
              style={[styles.cameraMemoriesButton, isUploadingMemories && styles.buttonDisabled]}
            >
              {isUploadingMemories ? (
                <ActivityIndicator color={colors.warmWhite} />
              ) : (
                <View style={styles.cameraIcon}>
                  <View style={styles.cameraIconTop} />
                  <View style={styles.cameraIconLens} />
                </View>
              )}
            </Pressable>
          </View>

          {isLoadingMemories ? (
            <View style={styles.memoriesEmpty}><ActivityIndicator color={colors.forest} /></View>
          ) : !hasLoadedMemories ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMemories()}
              style={styles.memoriesEmpty}
            >
              <Text style={styles.memoriesEmptyText}>View your saved memory photos</Text>
            </Pressable>
          ) : memories.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memoriesScroll}>
              {memories.map((memory) => <Image key={memory.path} source={{ uri: memory.url }} style={styles.memoryImage} />)}
            </ScrollView>
          ) : (
            <View style={styles.memoriesEmpty}><Text style={styles.memoriesEmptyText}>Add photos from your site visits and adventures together.</Text></View>
          )}

          {memoryStatus ? <Text style={styles.memoryStatus}>{memoryStatus}</Text> : null}
        </View>

        <View style={styles.feedbackReviewsArea}>
          <HostFeedbackButton
            hasUnread={hasUnreadHostFeedback}
            onPress={() => handleNavigation('/host-feedback')}
          />
          <SiteReviewsButton
            hasPendingReviews={hasPendingSiteReviews}
            onPress={() => handleNavigation('/site-reviews')}
          />
        </View>

        <View style={styles.memberDashboardGuide}>
        <HostPageGuide
          title="How to use your Member Dashboard"
          intro="Follow these steps to keep your account ready, reserve a private space, and manage every visit."
          tone="forest"
          steps={[
            { title: 'Keep profiles ready', text: 'Complete Parent Profile and add every dog that may attend a visit before you reserve.' },
            { title: 'Find a private space', text: 'Open Book Your Reservation to browse available properties. Review the site details, rules, amenities, arrival information, and rate before choosing a visit.' },
            { title: 'Choose a visit time', text: 'Select an available date, start time, end time, and every dog attending. A courtesy waiver, when available, can only be used at the host site that issued it.' },
            { title: 'Confirm your reservation', text: 'Review the total and select Confirm Reservation. For a paid visit, your card is secured at confirmation and payment settles one hour before the visit begins. A zero-dollar courtesy visit confirms without payment.' },
            { title: 'Manage upcoming or previous visits', text: 'Use My Reservations to check upcoming plans, completed visits, or cancellations. Cancel before the one-hour window when eligible for an automatic refund under the Cancellation and Refund Policy.' },
            { title: 'Review and message', text: 'Open Messages when you need to contact a host. After a completed visit, use Site Reviews when it appears to share your feedback about the property.' },
            { title: 'Explore Everything Dogs', text: 'Open Everything Dogs to browse dog services and products whenever you are ready.' },
          ]}
        />
        </View>
 
        <View style={styles.accountSection}>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
 
          <Text style={styles.accountEmail}>
            {session?.user.email}
          </Text>
 
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.cardPressed,
              isSigningOut && styles.buttonDisabled,
            ]}
          >
            {isSigningOut ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            )}
          </Pressable>

          <View style={styles.accountLinksRow}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/support' as never)} style={styles.accountLink}>
              <Text style={styles.accountLinkText}>Help & Support</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push('/settings' as never)} style={styles.accountLink}>
              <Text style={styles.accountLinkText}>Settings & Privacy</Text>
            </Pressable>
          </View>
        </View>

        {profileSaved === 'true' ? (
          <View accessibilityRole="alert" style={styles.profileSavedBanner}>
            <Text style={styles.profileSavedTitle}>Profile saved</Text>
            <Text style={styles.profileSavedText}>Your member profile is complete and ready for reservations.</Text>
          </View>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => router.push('/legal' as never)} style={styles.trustSafetyLink}>
          <Text style={styles.trustSafetyLinkTitle}>Legal Library</Text>
          <Text style={styles.trustSafetyLinkText}>Terms, privacy, safety, pricing, and marketplace policies</Text>
        </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2E8DC',
  },
 
  container: {
    paddingTop: 0,
    paddingBottom: 0,
  },
 
  // Keep the guest-dashboard artwork at its original portrait ratio.
  header: { aspectRatio: 1024 / 1536, backgroundColor: '#F2E8DC', marginTop: -38, width: '100%' },
  dashboardContent: { marginTop: -25, paddingBottom: 36, paddingHorizontal: 20 },

  userIntro: { marginBottom: 16, paddingHorizontal: 2 },
 
  memberName: { color: colors.brown, fontFamily: typography.display, fontSize: 44, fontWeight: '900', marginTop: 0 },
 
  headerDescription: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 0,
  },
 
  k9HeaderImage: { height: '100%', width: '100%' },
  profileSavedBanner: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 18, borderWidth: 1, marginBottom: 16, padding: 16 },
  profileSavedTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  profileSavedText: { color: colors.muted, fontSize: 14, lineHeight: 20 },

  featureCard: {
    backgroundColor: colors.forest,
    borderColor: '#315738',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 0,
    marginTop: -32,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.card,
    zIndex: 1,
  },
 
  featureContent: {
    flex: 1,
  },
 
  featureTitle: {
    color: colors.warmWhite,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 6,
  },
 
  featureDescription: {
    color: colors.cream,
    fontSize: 13,
    lineHeight: 19,
  },
 
  featureLink: {
    color: '#F0B56F',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
 
  sectionTitle: {
    color: colors.forest,
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 14,
  },

  accountLinksRow: { alignItems: 'center', marginTop: 20 },
  accountLink: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 6 },
  accountLinkText: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  trustSafetyLink: { alignItems: 'center', marginTop: 30, paddingHorizontal: 20, paddingVertical: 12 },
  pricingLink: { marginTop: 6 },
  privacyLink: { marginTop: 6 },
  trustSafetyLinkTitle: { color: colors.forest, fontSize: 15, fontWeight: '900', textDecorationLine: 'underline' },
  trustSafetyLinkText: { color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
 
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  subscriptionCard: { backgroundColor: colors.lightGreen, borderColor: colors.forest, borderRadius: 18, borderWidth: 1, marginBottom: 12, marginTop: 12, padding: 16, ...shadows.card },
  subscriptionEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  subscriptionSite: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 5 },
  subscriptionCount: { color: colors.forest, fontSize: 22, fontWeight: '900', marginTop: 8 },
  subscriptionNote: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 5 },

  memoriesSection: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 15, ...shadows.card },
  feedbackReviewsArea: { gap: 18, marginTop: 18 },
  memberDashboardGuide: { marginTop: -6 },
  memoriesHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 13 },
  memoriesCopy: { flex: 1 },
  memoriesTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 3 },
  memoriesDescription: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  uploadMemoriesButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 11, justifyContent: 'center', minHeight: 42, paddingHorizontal: 13 },
  uploadMemoriesButtonText: { color: colors.gold, fontSize: 14, fontWeight: '900' },
  cameraMemoriesButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 11, height: 42, justifyContent: 'center', width: 42 },
  cameraIcon: { borderColor: colors.gold, borderRadius: 4, borderWidth: 1.8, height: 16, justifyContent: 'center', position: 'relative', width: 22 },
  cameraIconTop: { backgroundColor: colors.gold, borderTopLeftRadius: 2, borderTopRightRadius: 2, height: 3, left: 4, position: 'absolute', top: -5, width: 8 },
  cameraIconLens: { alignSelf: 'center', borderColor: '#F0B56F', borderRadius: 5, borderWidth: 1.6, height: 9, width: 9 },
  memoriesScroll: { gap: 10 },
  memoryImage: { backgroundColor: colors.lightGreen, borderRadius: 13, height: 180, width: 180 },
  memoriesEmpty: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 13, borderStyle: 'dashed', borderWidth: 1, justifyContent: 'center', minHeight: 180, padding: 18 },
  memoriesEmptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  memoryStatus: { color: colors.red, fontSize: 13, fontWeight: '700', marginTop: 10 },
 
  actionCard: {
    alignItems: 'flex-start',
    width: '48.5%',
    minHeight: 134,
    backgroundColor: colors.warmWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: 0,
    ...shadows.card,
    justifyContent: 'center',
  },
  everythingDogsActionCard: { backgroundColor: colors.lightGreen },

  actionIcon: {
    fontSize: 28,
    height: 32,
    lineHeight: 32,
  },
  dogProfilesActionPaw: {
    height: 32,
    width: 32,
  },
  everythingDogsImage: { height: 32, width: 32 },
  favoriteActionIcon: {
    color: colors.red,
  },

  actionMessageIcon: {},
  actionStack: { width: '100%' },
  actionIconSlot: { alignItems: 'flex-start', height: 32, justifyContent: 'flex-start', marginBottom: 6, width: 32 },
  actionCopy: { width: '100%' },
 
  actionTitle: { ...memberUi.cardTitle, marginBottom: 0 },
 
  actionDescription: { ...memberUi.cardDescription, minHeight: 40 },
 
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
 
  accountSection: {
    alignItems: 'center',
    marginTop: 30,
  },
 
  accountLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
 
  accountEmail: {
    color: colors.forest,
    fontSize: 14,
    marginTop: 5,
    marginBottom: 12,
  },
 
  signOutButton: {
    minHeight: 46,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.red,
    paddingHorizontal: 22,
  },
 
  signOutButtonText: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '800',
  },
 
  buttonDisabled: {
    opacity: 0.6,
  },

});
