import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { getAuthEmailRedirectUrl } from '../../lib/auth-redirect';
import { supabase } from '../../lib/supabase';

export default function VerifyEmailScreen() {
  const { email: rawEmail, intent, resent } = useLocalSearchParams<{
    email?: string;
    intent?: string;
    resent?: string;
  }>();
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const isHost = intent === 'host';
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!email) {
      router.replace(isHost ? '/sign-up?intent=host' : '/sign-up');
    }
  }, [email, isHost]);

  const resendEmail = async () => {
    if (!email) return;

    try {
      setIsResending(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthEmailRedirectUrl(intent) },
      });

      if (error) {
        Alert.alert('Unable to send email', error.message);
        return;
      }

      Alert.alert('New email sent', 'Open the newest K9 Country email and click Confirm email address.');
    } catch {
      Alert.alert('Unable to send email', 'Please try again in a moment.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.logoBadge}><Text style={styles.logoText}>K9</Text></View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.description}>
          {resent === 'true' ? 'We sent a fresh confirmation email to:' : 'We sent a confirmation email to:'}
        </Text>
        <Text style={styles.email}>{email}</Text>
        <Text style={styles.hint}>
          Open the newest K9 Country email and click “Confirm email address.” You will return here automatically and be signed in.
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={isResending}
          onPress={() => void resendEmail()}
          style={[styles.resendButton, isResending && styles.buttonDisabled]}
        >
          {isResending ? <ActivityIndicator color={colors.forest} /> : <Text style={styles.resendButtonText}>Resend confirmation email</Text>}
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.replace(isHost ? '/sign-in?intent=host' : '/sign-in')} style={styles.signInButton}>
          <Text style={styles.signInText}>Return to sign in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoBadge: { alignItems: 'center', backgroundColor: colors.forest, borderColor: colors.brown, borderRadius: 36, borderWidth: 4, height: 72, justifyContent: 'center', marginBottom: 18, width: 72 },
  logoText: { color: colors.cream, fontSize: 32, fontWeight: '900' },
  title: { color: colors.forest, fontSize: 29, fontWeight: '900', textAlign: 'center' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12, textAlign: 'center' },
  email: { color: colors.forest, fontSize: 16, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 18, textAlign: 'center' },
  resendButton: { alignItems: 'center', justifyContent: 'center', marginTop: 28, minHeight: 44 },
  resendButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' },
  signInButton: { alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 44 },
  signInText: { color: colors.brown, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  buttonDisabled: { opacity: 0.6 },
});
