import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../../constants/theme';
import { hasCompletedMemberProfile } from '../../lib/member-profile';
import { useAuth } from '../../services/auth-context';

export default function EmailConfirmationCallbackScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { isLoading, isMember, session } = useAuth();

  useEffect(() => {
    if (!isLoading && isMember && session?.user.id) {
      const finishSignIn = async () => {
        const isHost = intent === 'host';
        await AsyncStorage.setItem('@k9-country/host-mode', isHost ? 'host' : 'guest');

        if (isHost) {
          router.replace('/host-dashboard');
          return;
        }

        const isComplete = await hasCompletedMemberProfile(session.user.id);
        router.replace(isComplete ? '/dashboard' : '/profile?onboarding=true');
      };

      void finishSignIn();
    }
  }, [intent, isLoading, isMember, session?.user.id]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.forest} />
        <Text style={styles.title}>Confirming your email</Text>
        <Text style={styles.description}>
          K9 Country is finishing your sign-in. If this link has expired, return to sign in and request a new verification email.
        </Text>
        {!isLoading && !isMember ? (
          <Pressable onPress={() => router.replace('/sign-in')} style={styles.button}>
            <Text style={styles.buttonText}>Return to Sign In</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 26, fontWeight: '900', marginTop: 18 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  button: { backgroundColor: colors.brown, borderRadius: 14, marginTop: 24, minHeight: 52, justifyContent: 'center', paddingHorizontal: 22 },
  buttonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '800' },
});
