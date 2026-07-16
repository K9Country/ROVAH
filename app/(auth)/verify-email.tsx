import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { colors } from '../../constants/theme';
import { getAuthEmailRedirectUrl } from '../../lib/auth-redirect';
import { supabase } from '../../lib/supabase';

const hostModeStorageKey = '@k9-country/host-mode';

export default function VerifyEmailScreen() {
  const { email: rawEmail, intent, resent } = useLocalSearchParams<{ email?: string; intent?: string; resent?: string }>();
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const isHost = intent === 'host';
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => setCooldownSeconds((seconds) => Math.max(seconds - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!email) {
      router.replace(isHost ? '/sign-up?intent=host' : '/sign-up');
    }
  }, [email, isHost]);

  const finishVerification = async () => {
    const token = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) {
      Alert.alert('Enter the six-digit code', 'Enter the code exactly as it appears in the K9 Country email.');
      return;
    }

    try {
      setIsVerifying(true);
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) {
        Alert.alert('Code not accepted', 'That code is invalid or expired. Request a new code and try again.');
        return;
      }

      await AsyncStorage.setItem(hostModeStorageKey, isHost ? 'host' : 'guest');
      router.replace(isHost ? '/host-dashboard' : '/dashboard');
    } catch {
      Alert.alert('Unable to verify email', 'Please try again or request a new code.');
    } finally {
      setIsVerifying(false);
    }
  };

  const resendCode = async () => {
    if (!email || cooldownSeconds > 0) return;

    try {
      setIsResending(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthEmailRedirectUrl(intent) },
      });
      if (error) {
        Alert.alert('Unable to send a new code', error.message);
        return;
      }

      setCooldownSeconds(60);
      Alert.alert('New code sent', 'Check your inbox and enter the newest six-digit code.');
    } catch {
      Alert.alert('Unable to send a new code', 'Please try again in a moment.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={styles.container}>
          <View style={styles.logoBadge}><Text style={styles.logoText}>K9</Text></View>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.description}>{resent === 'true' ? 'A fresh verification email was sent to:' : 'We sent a six-digit code to:'}</Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.hint}>Enter the code from your K9 Country email. If your email has a confirmation button instead, tap it to activate your account.</Text>

          <TextInput
            accessibilityLabel="Six-digit email verification code"
            autoComplete="one-time-code"
            autoFocus
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
            onSubmitEditing={() => void finishVerification()}
            placeholder="000000"
            placeholderTextColor="#8A877D"
            style={styles.codeInput}
            textAlign="center"
            value={code}
          />

          <Pressable
            accessibilityRole="button"
            disabled={isVerifying}
            onPress={() => void finishVerification()}
            style={[styles.primaryButton, isVerifying && styles.buttonDisabled]}
          >
            {isVerifying ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Verify and continue</Text>}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isResending || cooldownSeconds > 0}
            onPress={() => void resendCode()}
            style={[styles.resendButton, (isResending || cooldownSeconds > 0) && styles.buttonDisabled]}
          >
            {isResending ? <ActivityIndicator color={colors.forest} /> : <Text style={styles.resendButtonText}>{cooldownSeconds > 0 ? `Send another code in ${cooldownSeconds}s` : 'Send another code'}</Text>}
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => router.replace(isHost ? '/sign-in?intent=host' : '/sign-in')} style={styles.signInButton}>
            <Text style={styles.signInText}>Return to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  keyboardView: { flex: 1 },
  container: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoBadge: { alignItems: 'center', backgroundColor: colors.forest, borderColor: colors.brown, borderRadius: 36, borderWidth: 4, height: 72, justifyContent: 'center', marginBottom: 18, width: 72 },
  logoText: { color: colors.cream, fontSize: 32, fontWeight: '900' },
  title: { color: colors.forest, fontSize: 29, fontWeight: '900', textAlign: 'center' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 12, textAlign: 'center' },
  email: { color: colors.forest, fontSize: 16, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 18, textAlign: 'center' },
  codeInput: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, fontSize: 28, fontWeight: '800', letterSpacing: 8, marginTop: 24, minHeight: 60, paddingHorizontal: 18, width: '100%' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 16, minHeight: 56, width: '100%' },
  primaryButtonText: { color: colors.warmWhite, fontSize: 17, fontWeight: '800' },
  resendButton: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 44 },
  resendButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' },
  signInButton: { alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 44 },
  signInText: { color: colors.brown, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  buttonDisabled: { opacity: 0.6 },
});
