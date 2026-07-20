import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
 
import { colors } from '../../constants/theme';
import { getAuthEmailRedirectUrl } from '../../lib/auth-redirect';
import { supabase } from '../../lib/supabase';

const rememberedEmailKey = '@k9-country/remembered-email';
 
export default function SignInScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const loadRememberedEmail = async () => {
      const savedEmail = await AsyncStorage.getItem(rememberedEmailKey);

      if (savedEmail) {
        setEmail(savedEmail);
      }
    };

    void loadRememberedEmail();
  }, []);

  const showSignInError = (message: string) => {
    setSignInError(message);
    Alert.alert('Sign in failed', message);
  };
 
  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setSignInError(null);
 
    if (!normalizedEmail || !password) {
      Alert.alert('Missing information', 'Enter your email and password.');
      return;
    }
 
    try {
      setIsLoading(true);
 
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
 
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            const { error: resendError } = await supabase.auth.resend({
              type: 'signup',
              email: normalizedEmail,
              options: { emailRedirectTo: getAuthEmailRedirectUrl(intent) },
            });

            if (resendError) {
              Alert.alert('Verification email not sent', resendError.message);
              return;
            }

            router.replace(
            `/verify-email?email=${encodeURIComponent(normalizedEmail)}&intent=${intent === 'host' ? 'host' : 'guest'}&resent=true` as never
            );
            return;
          }

        showSignInError(
          'Wrong password or email address. Check your credentials and try again.'
        );
        return;
      }

      if (!data.user) {
        showSignInError('Wrong password or email address. Check your credentials and try again.');
        return;
      }

      if (rememberEmail) {
        await AsyncStorage.setItem(rememberedEmailKey, normalizedEmail);
      } else {
        await AsyncStorage.removeItem(rememberedEmailKey);
      }

      if (intent === 'host') {
        router.dismissAll();
        router.replace('/host-dashboard');
        return;
      }

      // Do not make further Supabase calls in the immediate password-sign-in
      // path. Auth has already succeeded; the protected routes perform the
      // member profile and dog-profile checks once the session is settled.
      router.dismissAll();
      router.replace('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      showSignInError(message || 'We could not sign you in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert('Enter your email', 'Enter the email address you used to create your K9 Country account first.');
      return;
    }

    try {
      setIsResendingVerification(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: getAuthEmailRedirectUrl(intent) },
      });

      if (error) {
        Alert.alert('Unable to send verification email', error.message);
        return;
      }

      Alert.alert('Verification email sent', 'Check your inbox and spam folder for the newest K9 Country confirmation email.');
    } catch {
      Alert.alert('Unable to send verification email', 'Please try again in a moment.');
    } finally {
      setIsResendingVerification(false);
    }
  };
 
  return (
    <SafeAreaView edges={intent === 'host' ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {intent === 'host' ? <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/')}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Welcome Page</Text>
          </Pressable> : null}
 
          <View style={[styles.headingArea, intent === 'host' && styles.hostHeadingArea]}>
            {intent !== 'host' ? (
              <View style={styles.memberHeroBleed}>
                <Image
                  accessibilityLabel="K9 Country member sign-in artwork"
                  contentFit="cover"
                  source={require('../../assets/images/k9-4.png')}
                  style={styles.memberHero}
                />
              </View>
            ) : null}
 
            <Text style={styles.title}>
              {intent === 'host' ? 'Host sign in' : 'Member sign in'}
            </Text>
 
            <Text style={styles.description}>
              {intent === 'host'
                ? 'Sign in to manage your private spaces, reservations, and guest messages.'
                : 'Sign in to manage reservations, favorites, and messages.'}
            </Text>
          </View>
 
          <View style={styles.form}>
            {signInError ? (
              <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.signInError}>
                <Text style={styles.signInErrorText}>{signInError}</Text>
              </View>
            ) : null}

            <View>
              <Text style={styles.label}>Email address</Text>
 
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={(value) => {
                  setEmail(value);
                  setSignInError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                style={styles.input}
                value={email}
              />
            </View>
 
            <View>
              <Text style={styles.label}>Password</Text>
 
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={(value) => {
                  setPassword(value);
                  setSignInError(null);
                }}
                onSubmitEditing={handleSignIn}
                placeholder="Enter your password"
                placeholderTextColor="#8A877D"
                returnKeyType="done"
                secureTextEntry={!isPasswordVisible}
                style={styles.input}
                value={password}
              />

              <Pressable
                accessibilityLabel={
                  isPasswordVisible ? 'Hide password' : 'Show password'
                }
                accessibilityRole="button"
                onPress={() => setIsPasswordVisible((current) => !current)}
                style={styles.showPasswordButton}
              >
                <Text style={styles.showPasswordText}>
                  {isPasswordVisible ? 'Hide Password' : 'Show Password'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberEmail }}
              onPress={() => setRememberEmail((current) => !current)}
              style={styles.rememberRow}
            >
              <View
                style={[
                  styles.checkbox,
                  rememberEmail && styles.checkboxChecked,
                ]}
              >
                {rememberEmail ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : null}
              </View>

              <View style={styles.rememberTextArea}>
                <Text style={styles.rememberLabel}>Remember my email</Text>
                <Text style={styles.rememberDescription}>
                  Your password is never stored by K9 Country.
                </Text>
              </View>
            </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isLoading}
                onPress={handleSignIn}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isLoading && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFDF8" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </Pressable>
 
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  intent === 'host'
                    ? ('/sign-up?intent=host' as never)
                    : '/sign-up'
                )
              }
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>
                New to K9 Country? Create an account
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isResendingVerification}
                onPress={() => void resendVerificationEmail()}
                style={[styles.resendVerificationButton, isResendingVerification && styles.buttonDisabled]}
              >
                {isResendingVerification ? (
                  <ActivityIndicator color={colors.forest} />
                ) : (
                  <Text style={styles.resendVerificationText}>Resend verification email</Text>
                )}
              </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
 
  keyboardView: {
    flex: 1,
  },
 
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 24,
  },
 
  backButton: {
    alignItems: 'center',
    left: 16,
    minHeight: 36,
    position: 'absolute',
    top: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
 
  backButtonText: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '700',
  },
 
  headingArea: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: 12,
  },
  hostHeadingArea: {
    marginTop: 88,
  },

  memberHero: {
    aspectRatio: 2 / 3,
    width: '100%',
  },

  memberHeroBleed: {
    alignSelf: 'stretch',
    marginBottom: 16,
    marginHorizontal: -24,
    marginTop: -24,
  },
 
  title: {
    color: colors.forest,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },
 
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 360,
  },
 
  form: {
    gap: 12,
  },
 
  label: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
 
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.warmWhite,
    color: colors.forest,
    fontSize: 16,
    paddingHorizontal: 16,
  },

  signInError: {
    backgroundColor: '#FCEDEB',
    borderColor: '#E9B7B0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },

  signInErrorText: {
    color: '#8C352C',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },

  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.forest,
    marginTop: 8,
  },
 
  primaryButtonText: {
    color: colors.warmWhite,
    fontSize: 17,
    fontWeight: '800',
  },
 
  buttonPressed: {
    opacity: 0.78,
  },
 
  buttonDisabled: {
    opacity: 0.65,
  },

  showPasswordButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    marginTop: 2,
  },

  showPasswordText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  rememberRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: -2,
  },

  checkbox: {
    alignItems: 'center',
    borderColor: colors.brown,
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
    width: 24,
  },

  checkboxChecked: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },

  checkmark: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '900',
  },

  rememberTextArea: {
    flex: 1,
  },

  rememberLabel: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
  },

  rememberDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  resendVerificationButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 44,
  },

  resendVerificationText: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  textButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  textButtonText: {
    color: colors.brown,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
