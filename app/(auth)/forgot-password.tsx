import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../../constants/theme';
import { getPasswordResetRedirectUrl } from '../../lib/auth-redirect';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const isAdministrator = intent === 'admin';
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const sendResetEmail = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Enter your email', 'Enter the email address connected to your ROVAH account.');
      return;
    }

    try {
      setIsSending(true);
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getPasswordResetRedirectUrl(isAdministrator ? 'admin' : undefined),
      });
      if (error) throw error;
      setIsSent(true);
    } catch (error) {
      Alert.alert(
        'Unable to send reset email',
        error instanceof Error ? error.message : 'Please try again in a moment.'
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>{isAdministrator ? 'ADMINISTRATOR ACCESS' : 'ACCOUNT HELP'}</Text>
          <Text style={styles.title}>{isAdministrator ? 'Reset administrator password' : 'Reset your password'}</Text>
          <Text style={styles.description}>
            Enter your {isAdministrator ? 'administrator' : 'account'} email and we will send a secure link to choose a new password.
          </Text>

          {isSent ? (
            <View style={styles.successCard} accessibilityLiveRegion="polite">
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successText}>
                If a ROVAH account uses that email address, a password-reset link is on its way. Check your inbox and spam folder.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#8A877D"
                style={styles.input}
                value={email}
              />
              <Pressable
                accessibilityRole="button"
                disabled={isSending}
                onPress={() => void sendResetEmail()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, isSending && styles.buttonDisabled]}
              >
                {isSending ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Email me a reset link</Text>}
              </Pressable>
            </>
          )}

          <Pressable accessibilityRole="button" onPress={() => router.replace((isAdministrator ? '/admin-sign-in' : '/sign-in') as never)} style={styles.backButton}>
            <Text style={styles.backButtonText}>Return to {isAdministrator ? 'administrator' : 'member'} sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  keyboardView: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  eyebrow: { color: colors.brown, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 10 },
  label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginTop: 28 },
  input: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, fontSize: 16, marginTop: 8, minHeight: 56, paddingHorizontal: 16 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 56 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.6 },
  successCard: { backgroundColor: colors.successSurface, borderColor: '#A7BE9B', borderRadius: 16, borderWidth: 1, marginTop: 26, padding: 18 },
  successTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  successText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 7 },
  backButton: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 48 },
  backButtonText: { color: colors.brown, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
});
