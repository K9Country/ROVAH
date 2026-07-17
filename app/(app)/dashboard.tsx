import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { colors, shadows, typography } from '../../constants/theme';
import { getUnreadConversationIds } from '../../lib/messaging';
import { supabase } from '../../lib/supabase';
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
 
const dashboardActions: DashboardAction[] = [
{
  title: 'Find a Private Space',
  description: 'Search private properties near you.',
  icon: '🔍',
  route: '/search',
},
  {
    title: 'My Reservations',
    description: 'View upcoming and previous visits.',
    icon: '📅',
    route: '/reservations',
  },
  {
    title: 'Favorites',
    description: 'Return to properties you love.',
    icon: '♥',
    route: '/favorites',
  },
  {
    title: 'Messages',
    description: 'Communicate with property hosts.',
    icon: '💬',
    route: '/messages',
  },
  {
    title: 'Profile & Settings',
    description: 'Manage your account and preferences.',
    icon: '⚙',
    route: '/profile',
  },
];
 
export default function DashboardScreen() {
  const { session } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [memories, setMemories] = useState<MemoryPhoto[]>([]);

  const [hasLoadedMemories, setHasLoadedMemories] = useState(false);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [isUploadingMemories, setIsUploadingMemories] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState('');

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

  useEffect(() => {
    void loadUnreadMessages();
    const refreshInterval = setInterval(
      () => void loadUnreadMessages(),
      15_000
    );
    return () => clearInterval(refreshInterval);
  }, [loadUnreadMessages]);

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
 
      const { error } = await supabase.auth.signOut();
      await AsyncStorage.removeItem('@k9-country/host-mode');
 
      if (error) {
        Alert.alert('Unable to sign out', error.message);
        return;
      }
 
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
 
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image source={require('../../assets/images/k9-10.png')} style={styles.k9HeaderImage} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => handleNavigation('/search')}
          style={({ pressed }) => [
            styles.featureCard,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.featureIcon}>
            <Text style={styles.featureIconText}>🔍</Text>
          </View>
 
          <View style={styles.featureContent}>
            <Text style={styles.featureEyebrow}>START HERE</Text>
 
            <Text style={styles.featureTitle}>
              Find a private space
            </Text>
 
            <Text style={styles.featureDescription}>
              Discover secure outdoor properties where your family and dog can
              relax without crowds or unfamiliar dogs.
            </Text>
 
            <Text style={styles.featureLink}>Search properties →</Text>
          </View>
        </Pressable>

        <View style={styles.grid}>
          {memberActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.title}
              onPress={() => action.route && handleNavigation(action.route)}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.cardPressed,
              ]}
            >
              {action.title === 'Messages' ? (
                <UnreadMessageIcon
                  hasUnread={hasUnreadMessages}
                  style={styles.actionMessageIcon}
                />
              ) : (
                <Text style={styles.actionIcon}>{action.icon}</Text>
              )}
 
              <Text style={styles.actionTitle}>{action.title}</Text>
 
              <Text style={styles.actionDescription}>
                {action.description}
              </Text>
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
              <ActivityIndicator color="#8A4F17" />
            ) : (
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            )}
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.push('/settings' as never)} style={styles.hostReturnLink}>
            <Text style={styles.hostReturnLinkText}>Settings & Privacy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/support' as never)} style={styles.hostReturnLink}>
            <Text style={styles.hostReturnLinkText}>Safety & Support</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="link" onPress={() => router.push('/trust-safety' as never)} style={styles.trustSafetyLink}>
          <Text style={styles.trustSafetyLinkTitle}>Trust & Safety</Text>
          <Text style={styles.trustSafetyLinkText}>How K9 Country helps keep every visit safe</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
 
  container: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 36,
  },
 
  header: { alignItems: 'center', justifyContent: 'center', marginBottom: 0 },

  userIntro: { marginBottom: 16, paddingHorizontal: 2 },
 
  memberName: { color: colors.brown, fontFamily: typography.display, fontSize: 44, fontWeight: '900', marginTop: 0 },
 
  headerDescription: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 0,
  },
 
  k9HeaderImage: { height: 266, marginTop: 0, resizeMode: 'contain', transform: [{ translateX: 12 }], width: '121%' },
 
  featureCard: { backgroundColor: colors.forest, borderRadius: 22, flexDirection: 'row', marginBottom: 16, padding: 18, ...shadows.card },
 
  featureIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    marginRight: 16,
  },
 
  featureIconText: {
    fontSize: 25,
  },
 
  featureContent: {
    flex: 1,
  },
 
  featureEyebrow: {
    color: '#D9C4A9',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 6,
  },
 
  featureTitle: {
    color: colors.warmWhite,
    fontSize: 23,
    fontWeight: '900',
    marginBottom: 8,
  },
 
  featureDescription: {
    color: colors.cream,
    fontSize: 14,
    lineHeight: 21,
  },
 
  featureLink: {
    color: '#F0B56F',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 13,
  },
 
  sectionTitle: {
    color: colors.forest,
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 14,
  },

  hostReturnLink: {
    alignSelf: 'center',
    marginTop: 24,
  },

  hostReturnLinkText: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  trustSafetyLink: { alignItems: 'center', marginTop: 30, paddingHorizontal: 20, paddingVertical: 12 },
  trustSafetyLinkTitle: { color: colors.forest, fontSize: 15, fontWeight: '900', textDecorationLine: 'underline' },
  trustSafetyLinkText: { color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
 
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  memoriesSection: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 15, ...shadows.card },
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
    width: '48%',
    minHeight: 134,
    backgroundColor: colors.warmWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: 10,
    ...shadows.card,
  },
 
  actionIcon: {
    fontSize: 26,
    marginBottom: 8,
  },

  actionMessageIcon: {
    marginBottom: 8,
  },
 
  actionTitle: {
    color: colors.forest,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
 
  actionDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
  },
 
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
    borderColor: colors.brown,
    paddingHorizontal: 22,
  },
 
  signOutButtonText: {
    color: colors.brown,
    fontSize: 15,
    fontWeight: '800',
  },
 
  buttonDisabled: {
    opacity: 0.6,
  },

});
