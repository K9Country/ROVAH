import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../../constants/theme';
import { useAuth } from '../../services/auth-context';

export default function EmailConfirmationCallbackScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { isLoading, isMember, session, setActiveMode } = useAuth();

  useEffect(() => {
    if (!isLoading && isMember && session?.user.id) {
      const finishSignIn = async () => {
        // This controls the first screen after confirmation only. Host access
        // itself remains protected by the host profile and route guards.
        const isHost = intent === 'host';
        await setActiveMode(isHost ? 'host' : 'guest');

        if (isHost) {
          router.replace('/host');
          return;
        }

        // An email-confirmation link belongs to the account-creation flow.
        // Take every new member through their required private profile before
        // they can reach the member dashboard or reserve a site.
        router.replace('/profile?onboarding=true');
      };

      void finishSignIn();
    }
  }, [intent, isLoading, isMember, session?.user.id, setActiveMode]);

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
