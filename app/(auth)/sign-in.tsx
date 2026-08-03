import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { getAccountType } from '../../lib/account-role';
import { getAuthEmailRedirectUrl } from '../../lib/auth-redirect';
import { clearExplicitMemberSignOut } from '../../lib/member-entry';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

const rememberedEmailKey = '@k9-country/remembered-email';
 
export default function SignInScreen() {
  const { intent, notice } = useLocalSearchParams<{ intent?: string; notice?: string }>();
  const {
    isHost,
    isLoading: isAuthLoading,
    isMember,
    session,
    setAccountTypeAfterSetup,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isMemberSignInExpanded, setIsMemberSignInExpanded] = useState(false);
  const signInSectionYRef = useRef(0);
  const signInScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const loadRememberedEmail = async () => {
      const savedEmail = await AsyncStorage.getItem(rememberedEmailKey);

      if (savedEmail) {
        setEmail(savedEmail);
      }
    };

    void loadRememberedEmail();
  }, []);

  useEffect(() => {
    if (isAuthLoading || !session) return;

    if (intent === 'admin') {
      router.replace('/admin');
      return;
    }

    if (intent === 'host' && isHost) {
      router.replace('/host-dashboard');
      return;
    }

    if (intent !== 'host' && isMember) {
      router.replace('/dashboard');
    }
  }, [intent, isAuthLoading, isHost, isMember, session]);

  useEffect(() => {
    if (notice !== 'host' && notice !== 'member') return;

    const message = notice === 'host'
      ? 'This email is registered as a Host account. Please use the Host Sign In page.'
      : 'This email is registered as a Member account. Please use the Member Sign In page.';
    setSignInError(message);
    Alert.alert('Use the correct sign-in page', message);
  }, [notice]);

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

      // Administrator access is verified only by the protected /admin screen.
      // Do not use the member/host account-type check here; an administrator
      // may not have either dashboard role.
      if (intent === 'admin') {
        if (rememberEmail) {
          await AsyncStorage.setItem(rememberedEmailKey, normalizedEmail);
        } else {
          await AsyncStorage.removeItem(rememberedEmailKey);
        }
        router.replace('/admin');
        return;
      }

      const accountType = await getAccountType(data.user.id);
      const requestedAccountType = intent === 'host' ? 'host' : 'member';

      if (!accountType) {
        await supabase.auth.signOut({ scope: 'local' });
        showSignInError('We could not identify this account type. Please contact ROVAH support.');
        return;
      }

      if (accountType !== requestedAccountType) {
        await supabase.auth.signOut({ scope: 'local' });
        showSignInError(
          accountType === 'host'
            ? 'This email is registered as a Host account. Please use the Host Sign In page.'
            : 'This email is registered as a Member account. Please use the Member Sign In page.'
        );
        return;
      }

      // The account type was just verified through the authenticated role
      // lookup. Resolve the shared auth state before the route effect sends
      // this session to its protected dashboard, instead of racing a second
      // deferred lookup from onAuthStateChange.
      setAccountTypeAfterSetup(accountType);

      if (rememberEmail) {
        await AsyncStorage.setItem(rememberedEmailKey, normalizedEmail);
      } else {
        await AsyncStorage.removeItem(rememberedEmailKey);
      }

      if (intent !== 'host') {
        await clearExplicitMemberSignOut();
      }
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
      Alert.alert('Enter your email', 'Enter the email address you used to create your ROVAH account first.');
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

      Alert.alert('Verification email sent', 'Check your inbox and spam folder for the newest ROVAH confirmation email.');
    } catch {
      Alert.alert('Unable to send verification email', 'Please try again in a moment.');
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleMemberSignInToggle = () => {
    setIsMemberSignInExpanded((current) => {
      if (!current) {
        requestAnimationFrame(() => {
          signInScrollRef.current?.scrollTo({
            animated: true,
            y: Math.max(0, signInSectionYRef.current - 12),
          });
        });
      }
      return !current;
    });
  };

  const positionSignInSection = (event: { nativeEvent: { layout: { y: number } } }) => {
    signInSectionYRef.current = event.nativeEvent.layout.y;
  };

  const signInFormFields = (
    <>
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

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rememberEmail }}
        onPress={() => setRememberEmail((current) => !current)}
        style={styles.rememberRow}
      >
        <View style={[styles.checkbox, rememberEmail && styles.checkboxChecked]}>
          {rememberEmail ? <Text style={styles.checkmark}>{'\u2713'}</Text> : null}
        </View>

        <View style={styles.rememberTextArea}>
          <Text style={styles.rememberLabel}>Remember my email</Text>
          <Text style={styles.rememberDescription}>Your password is never stored by ROVAH.</Text>
        </View>
      </Pressable>

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
          accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
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
        accessibilityRole="button"
        disabled={isLoading}
        onPress={handleSignIn}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
          isLoading && styles.buttonDisabled,
        ]}
      >
        {isLoading ? <ActivityIndicator color="#FFFDF8" /> : <Text style={styles.primaryButtonText}>Sign In</Text>}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={isLoading}
        onPress={() => router.push('/forgot-password' as never)}
        style={styles.forgotPasswordButton}
      >
        <Text style={styles.forgotPasswordText}>Forgot password?</Text>
      </Pressable>

      {intent === 'host' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sign-up?intent=host' as never)}
          style={styles.textButton}
        >
          <Text style={styles.textButtonText}>New to ROVAH? Create an account</Text>
        </Pressable>
      ) : null}

    </>
  );
 
  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[
        styles.safeArea,
        intent === 'host' && styles.hostSafeArea,
        intent !== 'host' && styles.memberSafeArea,
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="always"
          ref={signInScrollRef}
          showsVerticalScrollIndicator={false}
        >
          {false && intent === 'host' ? <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/')}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Welcome Page</Text>
          </Pressable> : null}
 
          <View
            style={[
              styles.headingArea,
              intent === 'host' && styles.hostHeadingArea,
              intent !== 'host' && styles.memberHeadingArea,
            ]}
          >
            {intent === 'host' ? (
              <View style={styles.memberHeroBleed}>
                <Image
                  accessibilityLabel="ROVAH host with ROVAH artwork"
                  contentFit="cover"
                  contentPosition="top"
                  source={require('../../assets/images/rovah-host-sign-in-header.png')}
                  style={styles.hostEntryHero}
                />
              </View>
            ) : (
              <View style={styles.memberHeroBleed}>
                <Image
                  accessibilityLabel="ROVAH explore more live better artwork"
                  contentFit="cover"
                  contentPosition="top"
                  source={require('../../assets/images/rovah-member-sign-in-staged.png')}
                  style={styles.memberHero}
                />
             </View>
             )}

            {false && intent === 'host' ? (
              <>
                <Text style={styles.title}>Host sign in</Text>
                <Text style={styles.description}>
                  Sign in to manage your private spaces, reservations, and guest messages.
                </Text>
              </>
            ) : null}
          </View>
 
          {false ? <View style={styles.form}>
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
                  Your password is never stored by ROVAH.
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
              disabled={isLoading}
              onPress={() => router.push('/forgot-password' as never)}
              style={styles.forgotPasswordButton}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
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
                New to ROVAH? Create an account
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
          </View> : null}

          {(
            <View style={[styles.memberActionCards, intent === 'host' && styles.hostActionCards]}>
              <View style={styles.memberActionCard}>
                <View style={styles.memberActionCopy}>
                  <Text style={styles.memberActionTitle}>{intent === 'host' ? 'New Host' : 'New Member'}</Text>
                  <Text style={styles.memberActionDescription}>
                    {intent === 'host'
                      ? 'Create your free host account and start sharing your private space.'
                      : 'Create your free ROVAH account and start exploring today.'}
                  </Text>
                </View>
                <Pressable
                  accessibilityHint={intent === 'host' ? 'Opens host registration' : 'Opens member registration'}
                  accessibilityLabel="Join Now"
                  accessibilityRole="button"
                  onPress={() => router.push((intent === 'host' ? '/sign-up?intent=host' : '/sign-up?intent=member') as never)}
                  style={({ pressed }) => [styles.joinNowButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.joinNowButtonText}>Join Now</Text>
                  <Text style={styles.actionArrow}>→</Text>
                </Pressable>
              </View>

              <View
                onLayout={positionSignInSection}
                style={styles.memberActionCard}
              >
                <View style={styles.memberActionCopy}>
                  <Text style={styles.memberActionTitle}>{intent === 'host' ? 'Host Sign In' : 'Member Sign In'}</Text>
                  <Text style={styles.memberActionDescription}>
                    {intent === 'host'
                      ? 'Sign in to manage your private spaces, reservations, and guest messages.'
                      : 'Sign in to manage your reservations, favorites, and messages.'}
                  </Text>
                </View>
                <Pressable
                  accessibilityHint={isMemberSignInExpanded ? 'Hides the sign-in form' : 'Shows the sign-in form'}
                  accessibilityLabel={isMemberSignInExpanded ? 'Hide Sign In' : 'Sign In'}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isMemberSignInExpanded }}
                  onPress={handleMemberSignInToggle}
                  style={({ pressed }) => [styles.memberSignInButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.memberSignInButtonText}>{isMemberSignInExpanded ? 'Hide' : 'Sign In'}</Text>
                  <Text style={styles.memberSignInArrow}>{isMemberSignInExpanded ? '↑' : '→'}</Text>
                </Pressable>

                {isMemberSignInExpanded ? (
                  <View style={styles.memberExpandedForm}>{signInFormFields}</View>
                ) : null}
              </View>
            </View>
          )}

          <Pressable
            accessibilityLabel="Return to welcome page"
            accessibilityRole="button"
            onPress={() => router.replace('/choose-path' as never)}
            style={styles.welcomePageLink}
          >
            <Text style={styles.welcomePageLinkText}>ROVAH</Text>
          </Pressable>
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

  memberSafeArea: {
    // Sampled from the edited bottom edge of the member artwork.
    backgroundColor: '#FBF3E8',
  },

  hostSafeArea: {
    // Matches the fade at the bottom edge of the host sign-in artwork.
    backgroundColor: '#FBF8F5',
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
    marginBottom: 32,
  },
  hostHeadingArea: {
    marginTop: 0,
  },

  memberHeadingArea: {
    marginTop: -15,
    marginBottom: 4,
  },

  hostSignInHero: {
    alignSelf: 'stretch',
    aspectRatio: 1,
    borderRadius: 0,
    marginBottom: -142,
    marginHorizontal: -24,
    marginTop: -6,
    overflow: 'hidden',
  },

  memberHero: {
    // Includes the full dog and foot, while ending before the sample-card
    // outline printed into the source artwork.
    aspectRatio: 0.711,
    width: '100%',
  },

  hostEntryHero: {
    aspectRatio: 0.595,
    width: '100%',
  },

  memberHeroBleed: {
    alignSelf: 'stretch',
    marginBottom: 0,
    marginHorizontal: -24,
    marginTop: 0,
  },
 
  title: {
    color: colors.forest,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },

  memberActionCards: {
    gap: 10,
  },

  hostActionCards: {
    marginTop: -155,
  },

  welcomePageLink: {
    alignItems: 'center',
    marginTop: 22,
    minHeight: 32,
  },

  welcomePageLinkText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  memberActionCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderColor: '#D9BF86',
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 14,
  },

  memberActionCopy: {
    flex: 1,
    minWidth: 155,
  },

  memberActionTitle: {
    color: colors.forest,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  memberActionDescription: {
    color: '#454139',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },

  joinNowButton: {
    alignItems: 'center',
    backgroundColor: colors.forest,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 112,
    paddingHorizontal: 12,
  },

  joinNowButtonText: {
    color: colors.warmWhite,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  actionArrow: {
    color: colors.warmWhite,
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 22,
  },

  memberSignInButton: {
    alignItems: 'center',
    borderColor: colors.forest,
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 112,
    paddingHorizontal: 12,
  },

  memberSignInButtonText: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  memberSignInArrow: {
    color: colors.forest,
    fontSize: 22,
    fontWeight: '400',
    lineHeight: 22,
  },

  memberExpandedForm: {
    borderTopColor: '#E7D6B4',
    borderTopWidth: 1,
    flexBasis: '100%',
    gap: 12,
    marginTop: 4,
    paddingBottom: 16,
    paddingTop: 20,
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
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
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
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 0,
  },

  checkbox: {
    alignItems: 'center',
    borderColor: colors.brown,
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginRight: 12,
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

  forgotPasswordButton: {
    alignSelf: 'center',
    minHeight: 38,
    justifyContent: 'center',
  },

  forgotPasswordText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  resendVerificationButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
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
