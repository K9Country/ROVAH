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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const signInRoute = intent === 'host' ? '/sign-in?intent=host' : '/sign-in';
  const verificationRoute = `/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&intent=${intent === 'host' ? 'host' : 'guest'}`;

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleSignUp = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const normalizedEmail = email.trim().toLowerCase();
 
    if (
      !normalizedFirstName ||
      !normalizedLastName ||
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
 
    if (password.length < 12) {
      Alert.alert(
        'Password is too short',
        'Create a password containing at least 12 characters.'
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
            first_name: normalizedFirstName,
            last_name: normalizedLastName,
            account_intent: intent === 'host' ? 'host' : 'guest',
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
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: normalizedEmail,
          options: { emailRedirectTo: getAuthEmailRedirectUrl(intent) },
        });

        if (!resendError) {
          router.replace(`${verificationRoute}&resent=true` as never);
          return;
        }

        showExistingAccountMessage(intent);
        return;
      }

      router.replace(verificationRoute as never);
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

          {intent === 'host' ? <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/')}
            style={[styles.backButton, styles.hostBackButton]}
          >
            <Text style={[styles.backButtonText, intent === 'host' && styles.hostBackButtonText]}>{intent === 'host' ? '← Welcome Page' : '← Back'}</Text>
          </Pressable> : null}
 
          {intent === 'host' ? (
            <View style={styles.hostHeroBleed}>
              <Image
                accessibilityLabel="K9 Country host benefits"
                contentFit="cover"
                source={require('../../assets/images/k9-12.png')}
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
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  accessibilityLabel="First name"
                  autoCapitalize="words"
                  autoComplete="name"
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor="#8A877D"
                  returnKeyType="next"
                  style={styles.input}
                  value={firstName}
                />
              </View>

              <View style={styles.nameField}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  accessibilityLabel="Last name"
                  autoCapitalize="words"
                  autoComplete="name"
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor="#8A877D"
                  returnKeyType="next"
                  style={styles.input}
                  value={lastName}
                />
              </View>
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
                placeholder="At least 12 characters"
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

            <Text style={styles.securityNote}>
              Your account information is protected with encrypted connections
              and secure access controls.
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
            {intent !== 'host' ? <View style={styles.memberFooterArtwork}>
              <Image
                accessibilityLabel="K9 Country fence"
                contentFit="contain"
                source={require('../../assets/images/k9-13.png')}
                style={styles.memberFooterImage}
              />
            </View> : null}
            {intent !== 'host' ? <View style={styles.memberWelcomeCard}>
              <Text style={styles.memberWelcomeTitle}>You’re About to Join{`\n`}Something Special</Text>
              <Text style={styles.memberWelcomeText}>You believe your dog deserves room to run, the freedom to explore, and a safe place to simply be a dog.</Text>
              <Text style={styles.memberWelcomeText}>That’s exactly why K9 Country exists.</Text>
              <Text style={styles.memberWelcomeText}>By creating your free account, you’ll gain access to private, host-approved spaces where you and your dog can enjoy off-leash adventures away from crowded public parks. Easily discover new locations, book visits in minutes, connect with trusted hosts, and explore spaces that fit your dog’s unique needs—all while enjoying more privacy, flexibility, and peace of mind.</Text>
              <Text style={styles.memberWelcomeText}>Whether your dog loves to run, train, sniff, play, or simply relax in a secure environment, K9 Country helps you create experiences you’ll both look forward to.</Text>
              <Text style={styles.memberWelcomeText}>We’re excited to welcome you to a community that puts dogs first.</Text>
              <View style={styles.memberWelcomeDivider} />
              <Text style={styles.memberWelcomeClosing}>More space. More freedom. More tail wags.</Text>
            </View> : null}
            {intent !== 'host' ? <View style={styles.memberWhyCard}>
              <Text style={styles.memberWhyTitle}>Why Choose K9 Country</Text>
              <Text style={styles.memberWhyLead}>At K9 Country, we believe finding a private place for dogs to run, explore, and play should be simple, affordable, and rewarding for everyone involved.</Text>
              <View style={styles.memberWhySection}>
                <Text style={styles.memberWhySectionTitle}>For Members</Text>
                <Text style={styles.memberWhyText}>Creating an account is completely free. There are no membership fees to browse available spaces, connect with trusted hosts, or book your next adventure. Simply find a space you love, reserve it, and enjoy more room, more freedom, and more tail wags.</Text>
              </View>
              <View style={styles.memberWhySection}>
                <Text style={styles.memberWhySectionTitle}>For Hosts</Text>
                <Text style={styles.memberWhyText}>Your property is valuable, and you deserve to keep more of what you earn. That’s why K9 Country uses a simple, transparent pricing model: hosts keep 85% of every completed booking, while K9 Country receives a 15% platform fee to support secure payments, platform improvements, customer support, and continued growth.</Text>
              </View>
              <View style={styles.memberWhyDivider} />
              <Text style={styles.memberWhyStatement}>Simple. Transparent. Fair.</Text>
              <Text style={styles.memberWhyText}>No hidden fees. No confusing pricing. Just a trusted community that connects members with private spaces while giving hosts an easy way to earn additional income.</Text>
              <Text style={styles.memberWhyText}>Whether you’re searching for a safe, private place where a dog can run free or you’re looking to turn your property into a new source of income, K9 Country was built to make the experience easy, trustworthy, and rewarding.</Text>
            </View> : null}
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

  hostBackButton: {
    top: 12,
  },

  hostBackButtonText: {
    color: colors.warmWhite,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowRadius: 4,
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
    marginTop: 20,
    marginBottom: 22,
  },

  hostHeroBleed: {
    alignSelf: 'stretch',
    marginHorizontal: -24,
  },

  hostHero: {
    aspectRatio: 2 / 3,
    width: '100%',
  },

  createHeroBleed: {
    alignSelf: 'stretch',
    marginHorizontal: -24,
  },

  createHero: {
    alignSelf: 'center',
    aspectRatio: 2 / 3,
    marginTop: 0,
    transform: [{ translateY: 12 }],
    width: '40%',
  },

  stepsBannerBleed: {
    alignSelf: 'stretch',
    marginHorizontal: -24,
    marginTop: -46,
    marginBottom: -20,
    zIndex: 1,
  },

  stepsBanner: {
    aspectRatio: 1.775,
    width: '100%',
  },

  memberFooterArtwork: {
    marginHorizontal: -24,
    marginTop: 0,
  },

  memberFooterImage: {
    aspectRatio: 8,
    width: '100%',
  },

  memberWelcomeCard: {
    backgroundColor: colors.forest,
    borderRadius: 22,
    marginTop: 2,
    padding: 21,
  },

  memberWelcomeTitle: {
    color: colors.warmWhite,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    marginBottom: 14,
  },

  memberWelcomeText: {
    color: '#E4EDE0',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },

  memberWelcomeDivider: {
    backgroundColor: 'rgba(228, 237, 224, 0.32)',
    height: 1,
    marginBottom: 15,
    marginTop: 3,
  },

  memberWelcomeClosing: {
    color: colors.gold,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 24,
  },

  memberWhyCard: {
    backgroundColor: '#FFF7E9',
    borderColor: '#E7C79D',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 4,
    padding: 21,
  },

  memberWhyTitle: {
    color: colors.forest,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    marginBottom: 12,
  },

  memberWhyLead: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },

  memberWhySection: {
    backgroundColor: colors.warmWhite,
    borderColor: '#E7C79D',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
  },

  memberWhySectionTitle: {
    color: colors.forest,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 7,
  },

  memberWhyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },

  memberWhyDivider: {
    backgroundColor: '#E7C79D',
    height: 1,
    marginBottom: 15,
    marginTop: 4,
  },

  memberWhyStatement: {
    color: colors.forest,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 10,
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

  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },

  nameField: {
    flex: 1,
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

  securityNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 16,
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
