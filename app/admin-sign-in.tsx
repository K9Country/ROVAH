import { router } from 'expo-router';
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

import { colors, typography } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../services/auth-context';

export default function AdministratorSignInScreen() {
  const { session, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkAdministratorAccess = async () => {
      if (!session?.user.id) return;

      try {
        setIsCheckingAccess(true);
        const { data, error } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (error) throw error;
        if (!mounted) return;

        if (data) {
          router.replace('/admin' as never);
          return;
        }

        await supabase.auth.signOut({ scope: 'local' });
        if (mounted) setMessage('This account has not been assigned administrator access.');
      } catch (error) {
        if (mounted) {
          setMessage(error instanceof Error ? error.message : 'We could not verify administrator access. Please try again.');
        }
      } finally {
        if (mounted) setIsCheckingAccess(false);
      }
    };

    if (!isLoading) void checkAdministratorAccess();

    return () => {
      mounted = false;
    };
  }, [isLoading, session?.user.id]);

  const signIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setMessage('Enter your administrator email address and password.');
      return;
    }

    try {
      setMessage(null);
      setIsSigningIn(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not sign you in. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const isBusy = isLoading || isSigningIn || isCheckingAccess;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>ADMINISTRATOR ACCESS</Text>
          <Text style={styles.title}>Administrator sign in</Text>
          <Text style={styles.description}>Use your ROVAH administrator email to review host and site submissions.</Text>

          {message ? <View accessibilityLiveRegion="polite" style={styles.messageCard}><Text style={styles.messageText}>{message}</Text></View> : null}

          <Text style={styles.label}>Administrator email</Text>
          <TextInput
            accessibilityLabel="Administrator email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!isBusy}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="admin@rovah.dog"
            placeholderTextColor="#8A877D"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Administrator password"
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!isBusy}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor="#8A877D"
            secureTextEntry={!isPasswordVisible}
            style={styles.input}
            value={password}
          />
          <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => setIsPasswordVisible((current) => !current)} style={styles.showPasswordButton}>
            <Text style={styles.showPasswordText}>{isPasswordVisible ? 'Hide Password' : 'Show Password'}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => void signIn()} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, isBusy && styles.buttonDisabled]}>
            {isBusy ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Sign in as administrator</Text>}
          </Pressable>

          <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => router.push('/forgot-password?intent=admin' as never)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>First time here? Create or reset password</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={isBusy} onPress={() => router.replace('/choose-path' as never)} style={styles.returnButton}>
            <Text style={styles.returnButtonText}>Return to Choose Path</Text>
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
  label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginTop: 22 },
  input: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, fontSize: 16, marginTop: 8, minHeight: 56, paddingHorizontal: 16 },
  showPasswordButton: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 4, minHeight: 38 },
  showPasswordText: { color: colors.brown, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 12, minHeight: 56 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.6 },
  secondaryButton: { alignItems: 'center', marginTop: 16, minHeight: 38 },
  secondaryButtonText: { color: colors.brown, fontSize: 14, fontWeight: '900', textDecorationLine: 'underline' },
  returnButton: { alignItems: 'center', marginTop: 6, minHeight: 38 },
  returnButtonText: { color: colors.muted, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  messageCard: { backgroundColor: '#F8E5E1', borderColor: '#C7796A', borderRadius: 14, borderWidth: 1, marginTop: 20, padding: 14 },
  messageText: { color: '#7D2D23', fontSize: 14, fontWeight: '700', lineHeight: 20 },
});
