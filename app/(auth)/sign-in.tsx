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

  useEffect(() => {
    const loadRememberedEmail = async () => {
      const savedEmail = await AsyncStorage.getItem(rememberedEmailKey);

      if (savedEmail) {
        setEmail(savedEmail);
      }
    };

    void loadRememberedEmail();
  }, []);
 
  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
 
    if (!normalizedEmail || !password) {
      Alert.alert('Missing information', 'Enter your email and password.');
      return;
    }
 
    try {
      setIsLoading(true);
 
      const { error } = await supabase.auth.signInWithPassword({
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

        if (
          intent === 'host' &&
          error.message.toLowerCase().includes('invalid login credentials')
        ) {
          router.replace(
            `/sign-up?intent=host&email=${encodeURIComponent(normalizedEmail)}` as never
          );
          return;
        }

        Alert.alert('Unable to sign in', error.message);
        return;
      }

      if (rememberEmail) {
        await AsyncStorage.setItem(rememberedEmailKey, normalizedEmail);
      } else {
        await AsyncStorage.removeItem(rememberedEmailKey);
      }

      if (intent === 'host') {
        await AsyncStorage.setItem('@k9-country/host-mode', 'host');
        router.replace('/host-dashboard');
        return;
      }

      await AsyncStorage.setItem('@k9-country/host-mode', 'guest');
      router.replace('/dashboard');
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not sign you in. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
 
          <View style={styles.headingArea}>
            {intent === 'host' ? (
              <View style={styles.logoBadge}>
                <Text style={styles.logoText}>K9</Text>
              </View>
            ) : (
              <View style={styles.memberHeroBleed}>
                <Image
                  accessibilityLabel="K9 Country member sign-in artwork"
                  contentFit="cover"
                  source={require('../../assets/images/k9-4.png')}
                  style={styles.memberHero}
                />
              </View>
            )}
 
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
            <View>
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
                onChangeText={setPassword}
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
    top: 48,
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
 
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderWidth: 4,
    borderColor: colors.brown,
    marginBottom: 20,
  },

  memberHero: {
    aspectRatio: 2 / 3,
    width: '100%',
  },

  memberHeroBleed: {
    alignSelf: 'stretch',
    marginBottom: 12,
    marginHorizontal: -24,
  },
  logoText: { color: colors.cream, fontSize: 32, fontWeight: '900' },
 
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
