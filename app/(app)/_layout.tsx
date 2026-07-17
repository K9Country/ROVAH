import { Stack, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useAuth } from '../../services/auth-context';

const hostOnlyRoutes = new Set([
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

const memberOnlyRoutes = new Set([
  '/dashboard',
  '/favorites',
  '/messages',
  '/profile',
  '/property',
  '/reservations',
  '/review',
  '/search',
]);

export default function AppLayout() {
  const { isHost, isLoading, isMember } = useAuth();
  const pathname = usePathname();
  const routeRoot = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  const needsHostAccess = hostOnlyRoutes.has(routeRoot);
  const needsMemberAccess = memberOnlyRoutes.has(routeRoot);

  useEffect(() => {
    if (isLoading) return;

    if (!isMember) {
      router.replace('/' as never);
      return;
    }

    if (needsHostAccess && !isHost) {
      router.replace('/dashboard' as never);
      return;
    }

    if (needsMemberAccess && isHost) {
      router.replace('/host-dashboard' as never);
    }
  }, [isHost, isLoading, isMember, needsHostAccess, needsMemberAccess]);

  if (
    isLoading ||
    !isMember ||
    (needsHostAccess && !isHost) ||
    (needsMemberAccess && isHost)
  ) {
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
