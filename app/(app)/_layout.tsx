import { Stack, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

const hostOnlyRoutes = new Set([
  '/host',
  '/create-property',
  '/host-calendar',
  '/host-dashboard',
  '/host-analytics',
  '/host-guest-message',
  '/host-welcome-message',
  '/host-guests',
  '/host-messages',
  '/host-payments',
  '/local-promotions',
  '/host-reservations',
  '/host-reviews',
  '/property-draft',
]);

const memberOnlyRoutes = new Set([
  '/dashboard',
  '/dog-profiles',
  '/everything-dogs',
  '/favorites',
  '/host-profile',
  '/host-feedback',
  '/messages',
  '/profile',
  '/property',
  '/reservations',
  '/search',
  '/settings',
  '/site-reviews',
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
      router.replace('/choose-path' as never);
      return;
    }

    if (needsHostAccess && !isHost) {
      void supabase.auth.signOut();
      router.dismissAll();
      router.replace('/sign-in?intent=host&notice=member' as never);
      return;
    }

    if (needsMemberAccess && isHost) {
      void supabase.auth.signOut();
      router.dismissAll();
      router.replace('/sign-in?notice=host' as never);
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
        <Text style={styles.loadingText}>
          {needsHostAccess ? 'Loading your host dashboard…' : 'Loading ROVAH…'}
        </Text>
      </View>
    );
  }

  return <Stack screenOptions={{ gestureEnabled: false, headerShown: false }} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
});
