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

function getSignupErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('unexpected_failure') ||
    normalizedMessage.includes('"status":500') ||
    normalizedMessage.includes('status:500')
  ) {
    return 'We could not send your verification email right now. Please try again shortly or contact K9 Country support.';
  }

  return message || 'We could not create your account. Please try again.';
}

function showExistingAccountMessage(intent?: string) {
  const accountType = intent === 'host' ? 'host' : 'dog owner';

  Alert.alert(
    `${accountType.charAt(0).toUpperCase()}${accountType.slice(1)} account already exists`,
    'An account already uses this email address. Please sign in to continue.'
  );
}
 
export default function SignUpScreen() {
  const { intent, email: initialEmail } = useLocalSearchParams<{
    intent?: string;
    email?: string;
  }>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const signInRoute = intent === 'host' ? '/sign-in?intent=host' : '/sign-in';

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleSignUp = async () => {
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
 
    if (
      !normalizedName ||
      !normalizedEmail ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert(
        'Missing information',
        'Complete every field before creating your account.'
      );
      return;
    }
 
    if (password.length < 8) {
      Alert.alert(
        'Password is too short',
        'Create a password containing at least 8 characters.'
      );
      return;
    }
 
    if (password !== confirmPassword) {
      Alert.alert(
        'Passwords do not match',
        'Enter the same password in both password fields.'
      );
      return;
    }
 
    try {
      setIsLoading(true);
 
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedName,
          },
          emailRedirectTo: getAuthEmailRedirectUrl(intent),
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          showExistingAccountMessage(intent);
          return;
        }

        Alert.alert('Unable to create account', getSignupErrorMessage(error));
        return;
      }

      if (data.user?.identities?.length === 0) {
        showExistingAccountMessage(intent);
        return;
      }

      router.replace(
        `/verify-email?email=${encodeURIComponent(normalizedEmail)}&intent=${intent === 'host' ? 'host' : 'guest'}` as never
      );
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not create your account. Please try again.'
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
          {intent !== 'host' ? (
            <View style={styles.createHeroBleed}>
              <Image
                accessibilityLabel="K9 Country create account artwork"
                contentFit="cover"
                source={require('../../assets/images/k9-5.png')}
                style={styles.createHero}
              />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={[styles.backButtonText, intent === 'host' && styles.hostBackButtonText]}>← Back</Text>
          </Pressable>
 
          {intent === 'host' ? (
            <View style={styles.hostHeroBleed}>
              <Image
                accessibilityLabel="K9 Country host account artwork"
                contentFit="cover"
                source={require('../../assets/images/k9-6.png')}
                style={styles.hostHero}
              />
            </View>
          ) : null}

          {intent === 'host' ? (
            <View style={styles.hostHeading}>
              <Text style={styles.title}>Create your host account</Text>
              <Text style={styles.description}>
                Create your account, then tell us about the private space you want to share.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.stepsBannerBleed}>
                <Image
                  accessibilityLabel="K9 Country account setup steps"
                  contentFit="contain"
                  source={require('../../assets/images/k9-3.png')}
                  style={styles.stepsBanner}
                />
              </View>

              <Text style={styles.joinTitle}>Join the Pack</Text>

              <Text style={styles.description}>
                Create your member account to search, save, and reserve private spaces.
              </Text>
            </>
          )}

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Full name</Text>
 
              <TextInput
                accessibilityLabel="Full name"
                autoCapitalize="words"
                autoComplete="name"
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                style={styles.input}
                value={fullName}
              />
            </View>
 
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
                autoComplete="new-password"
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                secureTextEntry={!isPasswordVisible}
                style={styles.input}
                value={password}
              />
            </View>
 
            <View>
              <Text style={styles.label}>Confirm password</Text>
 
              <TextInput
                accessibilityLabel="Confirm password"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setConfirmPassword}
                onSubmitEditing={handleSignUp}
                placeholder="Enter your password again"
                placeholderTextColor="#8A877D"
                returnKeyType="done"
                secureTextEntry={!isPasswordVisible}
                style={styles.input}
                value={confirmPassword}
              />

              <Pressable
                accessibilityLabel={
                  isPasswordVisible ? 'Hide passwords' : 'Show passwords'
                }
                accessibilityRole="button"
                onPress={() => setIsPasswordVisible((current) => !current)}
                style={styles.showPasswordButton}
              >
                <Text style={styles.showPasswordText}>
                  {isPasswordVisible ? 'Hide Passwords' : 'Show Passwords'}
                </Text>
              </Pressable>
            </View>
 
            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              onPress={handleSignUp}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isLoading && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFDF8" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {intent === 'host' ? 'Create Host Account' : 'Create Account'}
                </Text>
              )}
            </Pressable>
 
            <Text style={styles.termsText}>
              By creating an account, you agree to K9 Country’s Terms of
              Service, Privacy Policy, and applicable safety rules.
            </Text>

            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/legal' as never)}
              style={styles.termsLink}
            >
              <Text style={styles.termsLinkText}>Read Terms, Privacy & Community Rules</Text>
            </Pressable>
 
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(signInRoute as never)}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>
                Already have an account? Sign In
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
    left: 16,
    minHeight: 36,
    position: 'absolute',
    top: 48,
    justifyContent: 'center',
    zIndex: 1,
  },
 
  backButtonText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '700',
  },

  hostBackButtonText: {
    color: colors.warmWhite,
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
    marginBottom: 18,
  },

  hostHeading: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: 12,
  },

  hostHeroBleed: {
    alignSelf: 'stretch',
    marginHorizontal: -24,
  },

  hostHero: {
    aspectRatio: 9 / 16,
    transform: [{ translateY: -60 }],
    width: '100%',
  },

  createHeroBleed: {
    alignSelf: 'stretch',
    marginHorizontal: -24,
  },

  createHero: {
    alignSelf: 'center',
    aspectRatio: 2 / 3,
    transform: [{ translateY: 48 }],
    width: '56%',
  },

  stepsBannerBleed: {
    alignSelf: 'stretch',
    marginHorizontal: -24,
    marginTop: -10,
    marginBottom: -20,
    zIndex: 1,
  },

  stepsBanner: {
    aspectRatio: 1.775,
    width: '100%',
  },
  logoText: { color: colors.cream, fontSize: 32, fontWeight: '900' },
 
  title: {
    color: colors.forest,
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },

  joinTitle: {
    alignSelf: 'center',
    color: colors.forest,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },
 
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 360,
    alignSelf: 'center',
    marginBottom: 12,
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
    backgroundColor: colors.brown,
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

  verificationContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  verificationText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 2,
  },

  verificationEmail: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
  },

  verificationHint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 22,
  },

  resendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },

  resendButtonText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '900',
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

  termsText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  termsLink: {
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },

  termsLinkText: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
 
  textButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  textButtonText: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
