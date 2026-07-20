import { Stack, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '../../constants/theme';
import { useAuth } from '../../services/auth-context';

const hostOnlyRoutes = new Set([
  '/host',
  '/create-property',
  '/host-calendar',
  '/host-dashboard',
  '/host-analytics',
  '/host-guest-message',
  '/host-guests',
  '/host-messages',
  '/host-payments',
  '/host-reservations',
  '/host-reviews',
  '/property-draft',
]);

const memberOnlyRoutes = new Set([
  '/dashboard',
  '/dog-profiles',
  '/favorites',
  '/host-profile',
  '/messages',
  '/profile',
  '/property',
  '/reservations',
  '/search',
  '/settings',
  '/support',
]);

export default function AppLayout() {
  const { isHost, isLoading, isMember } = useAuth();
  const pathname = usePathname();
  const routeRoot = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  const needsHostAccess = hostOnlyRoutes.has(routeRoot);
  // Hosts and members share the conversation screen, but hosts can reach it
  // only from Host Messages with a conversation ID. All other member routes
  // remain unavailable to hosts.
  const isHostConversationRoute = routeRoot === '/messages' && isHost;
  const needsMemberAccess = memberOnlyRoutes.has(routeRoot) && !isHostConversationRoute;

  useEffect(() => {
    if (isLoading) return;

    if (!isMember && !isHost) {
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
    (!isMember && !isHost) ||
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
