import { Stack, usePathname } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import '../global.css';
 
import { colors } from '../constants/theme';
import { SideBackNavigation } from '../components/side-back-navigation';
import { AuthProvider, useAuth } from '../services/auth-context';
 
function RootNavigator() {
  const { isLoading } = useAuth();
  const pathname = usePathname();
 
  // Keep the email callback mounted while the authentication provider
  // finishes loading the new session. Returning only a loading view here
  // unmounts the navigator and loses /auth/callback before a new account's
  // role has been created.
  if (isLoading && pathname !== '/auth/callback' && pathname !== '/reset-password') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.forest} />
        <Text style={styles.loadingText}>
          {pathname === '/host-dashboard' ? 'Loading your host dashboard…' : 'Loading ROVAH…'}
        </Text>
      </View>
    );
  }
 
  return (
      <Stack screenOptions={{ gestureEnabled: false, headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="choose-path" />
      <Stack.Screen name="host-info" />
      <Stack.Screen name="pricing" />
      <Stack.Screen name="trust-safety" />
      <Stack.Screen name="legal" />
      <Stack.Screen name="legal-acceptance" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="admin-sign-in" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
 
export default function RootLayout() {
  return (
    <View style={styles.appShell}>
      <AuthProvider>
        <RootNavigator />
        <SideBackNavigation />
      </AuthProvider>
    </View>
  );
}
 
const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  loadingText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
  appShell: {
    backgroundColor: '#F6F0E4',
    flex: 1,
  },
});
