import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
 
import { colors } from '../constants/theme';
import { AuthProvider, useAuth } from '../services/auth-context';
 
function RootNavigator() {
  const { isLoading } = useAuth();
 
  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.forest} />
      </View>
    );
  }
 
  return (
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="host-info" />
      <Stack.Screen name="legal" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
 
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
 
const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
});
