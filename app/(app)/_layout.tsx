import { Stack, router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../../constants/theme';
import { hasCompletedMemberProfile } from '../../lib/member-profile';
import { useAuth } from '../../services/auth-context';

const hostOnlyRoutes = new Set([
  '/host',
  '/create-property',
  '/host-calendar',
  '/host-dashboard',
  '/host-guests',
  '/host-messages',
  '/host-payments',
  '/host-reservations',
  '/host-reviews',
  '/property-draft',
]);

export default function AppLayout() {
  const { isHost, isLoading, isMember, session } = useAuth();
  const pathname = usePathname();
  const routeRoot = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  const needsHostAccess = hostOnlyRoutes.has(routeRoot);
  const needsMemberProfile = isMember && !isHost && !needsHostAccess && routeRoot !== '/profile';
  const [isCheckingMemberProfile, setIsCheckingMemberProfile] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isMember) {
      router.replace('/' as never);
      return;
    }

    if (needsHostAccess && !isHost) {
      router.replace('/dashboard' as never);
    }
  }, [isHost, isLoading, isMember, needsHostAccess]);

  useEffect(() => {
    let isMounted = true;

    const checkMemberProfile = async () => {
      if (!needsMemberProfile || !session?.user.id) {
        if (isMounted) setIsCheckingMemberProfile(false);
        return;
      }

      setIsCheckingMemberProfile(true);
      const isComplete = await hasCompletedMemberProfile(session.user.id);
      if (!isMounted) return;

      setIsCheckingMemberProfile(false);
      if (!isComplete) {
        router.replace('/profile?onboarding=true');
      }
    };

    void checkMemberProfile();
    return () => {
      isMounted = false;
    };
  }, [needsMemberProfile, session?.user.id]);

  if (isLoading || !isMember || (needsHostAccess && !isHost) || isCheckingMemberProfile) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.forest} size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    flex: 1,
    justifyContent: 'center',
  },
});
