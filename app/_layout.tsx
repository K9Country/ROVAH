import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
 
import { AuthProvider, useAuth } from '../services/auth-context';
 
function RootNavigator() {
  const { accountType, isLoading, session } = useAuth();
 
  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#263A24" />
      </View>
    );
  }
 
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
 
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
 
      <Stack.Protected guard={Boolean(session) && accountType === 'member'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={Boolean(session) && accountType === 'host'}>
        <Stack.Screen name="host-dashboard" />
      </Stack.Protected>
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
    backgroundColor: '#F4ECDD',
  },
});
