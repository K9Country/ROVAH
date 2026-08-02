import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/theme';
import { useAuth } from '../services/auth-context';

const dashboardRoutes = new Set(['/dashboard', '/host-dashboard', '/host']);

export function SideBackNavigation() {
  const { isHost, isLoading, isMember } = useAuth();
  const pathname = usePathname();
  const routeRoot = `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;

  // Dashboards are destinations, not steps in a flow. In particular, the
  // Host Dashboard intentionally has no back affordance.
  // The welcome page and dashboards are starting points. Every other screen
  // after welcome gets the same middle-left back control, including sign-in,
  // sign-up, and public information pages.
  if (isLoading || pathname === '/' || pathname === '/choose-path' || dashboardRoutes.has(routeRoot)) return null;

  const fallbackRoute = isHost ? '/host-dashboard' : isMember ? '/dashboard' : '/choose-path';

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackRoute as never);
  };

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable
        accessibilityHint="Returns to the previous page"
        accessibilityLabel="Back"
        accessibilityRole="button"
        onPress={goBack}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.arrow}>‹</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 50 },
  button: { alignItems: 'center', backgroundColor: 'rgba(38, 58, 36, 0.16)', borderRadius: 20, height: 40, justifyContent: 'center', left: 8, position: 'absolute', top: '50%', transform: [{ translateY: -20 }], width: 40 },
  arrow: { color: colors.warmWhite, fontSize: 39, fontWeight: '300', lineHeight: 40, marginTop: -4 },
  buttonPressed: { backgroundColor: 'rgba(38, 58, 36, 0.30)' },
});
