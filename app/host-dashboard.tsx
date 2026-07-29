import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';
import { useAuth } from '../services/auth-context';

export default function HostDashboardScreen() {
  const { session } = useAuth();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('Unable to sign out', error.message);
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>HOST PORTAL</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.description}>
          You are signed in as a host. This area is separate from the member experience.
        </Text>
        <Text style={styles.email}>{session?.user.email}</Text>
        <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.button}>
          <Text style={styles.buttonText}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4ECDD' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#8A4F17', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#263A24', fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: '#6D6A60', fontSize: 16, lineHeight: 24, marginTop: 12 },
  email: { color: '#263A24', fontSize: 14, marginTop: 18 },
  button: { alignItems: 'center', backgroundColor: '#8A4F17', borderRadius: 14, justifyContent: 'center', marginTop: 28, minHeight: 54 },
  buttonText: { color: '#FFFDF8', fontSize: 16, fontWeight: '800' },
});
