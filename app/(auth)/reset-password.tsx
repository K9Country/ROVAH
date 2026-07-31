import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '../../lib/supabase';

export default function ResetPasswordScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const isAdministrator = intent === 'admin';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkRecoverySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsRecoveryReady(Boolean(session));
      setIsCheckingLink(false);
      if (!session) setErrorMessage('This password-reset link is invalid or has expired. Please request a new one.');
    };

    void checkRecoverySession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || Boolean(session)) {
        setIsRecoveryReady(Boolean(session));
        setErrorMessage(session ? null : 'This password-reset link is invalid or has expired. Please request a new one.');
        setIsCheckingLink(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const savePassword = async () => {
    setErrorMessage(null);
    if (newPassword.length < 8) {
      setErrorMessage('Your new password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Enter the same new password in both fields.');
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
      router.replace((isAdministrator ? '/admin-sign-in' : '/sign-in') as never);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We could not update your password. Please request a new reset link and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>{isAdministrator ? 'ADMINISTRATOR ACCESS' : 'ACCOUNT HELP'}</Text>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.description}>Create a new password for your {isAdministrator ? 'ROVAH administrator' : 'ROVAH'} account.</Text>

          {isCheckingLink ? <ActivityIndicator color={colors.forest} size="large" style={styles.loader} /> : null}
          {errorMessage ? <View style={styles.errorCard}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}

          {isRecoveryReady ? (
            <>
              <Text style={styles.label}>New password</Text>
              <TextInput accessibilityLabel="New password" autoCapitalize="none" autoComplete="new-password" onChangeText={setNewPassword} secureTextEntry={!isPasswordVisible} style={styles.input} value={newPassword} />
              <Text style={styles.label}>Confirm new password</Text>
              <TextInput accessibilityLabel="Confirm new password" autoCapitalize="none" autoComplete="new-password" onChangeText={setConfirmPassword} secureTextEntry={!isPasswordVisible} style={styles.input} value={confirmPassword} />
              <Pressable accessibilityRole="button" onPress={() => setIsPasswordVisible((current) => !current)} style={styles.showPasswordButton}>
                <Text style={styles.showPasswordText}>{isPasswordVisible ? 'Hide Passwords' : 'Show Passwords'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void savePassword()} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, isSaving && styles.buttonDisabled]}>
                {isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Save new password</Text>}
              </Pressable>
            </>
          ) : null}

          {!isCheckingLink ? <Pressable accessibilityRole="button" onPress={() => router.replace((isAdministrator ? '/forgot-password?intent=admin' : '/forgot-password') as never)} style={styles.backButton}><Text style={styles.backButtonText}>{isRecoveryReady ? 'Cancel and return to sign in' : 'Request a new reset link'}</Text></Pressable> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, keyboardView: { flex: 1 }, container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  eyebrow: { color: colors.brown, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 }, title: { color: colors.forest, fontFamily: typography.display, fontSize: 30, fontWeight: '900', marginTop: 8 }, description: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 10 },
  loader: { marginTop: 32 }, label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginTop: 20 }, input: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, fontSize: 16, marginTop: 8, minHeight: 56, paddingHorizontal: 16 },
  showPasswordButton: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 4, minHeight: 38 }, showPasswordText: { color: colors.brown, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 12, minHeight: 56 }, primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, buttonPressed: { opacity: 0.8 }, buttonDisabled: { opacity: 0.6 },
  errorCard: { backgroundColor: colors.dangerSurface, borderColor: '#E9B7B0', borderRadius: 14, borderWidth: 1, marginTop: 24, padding: 16 }, errorText: { color: colors.danger, fontSize: 15, fontWeight: '700', lineHeight: 22 },
  backButton: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 48 }, backButtonText: { color: colors.brown, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
});
