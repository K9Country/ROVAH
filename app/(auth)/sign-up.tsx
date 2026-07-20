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
import { formatUsPhoneNumber, hasValidUsPhoneNumber, phoneNumberHelpText } from '../../lib/phone-number';
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
 
export default function SignUpScreen() {
  const { intent, email: initialEmail } = useLocalSearchParams<{
    intent?: string;
    email?: string;
  }>();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string;
    siteAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const signInRoute = intent === 'host' ? '/sign-in?intent=host' : '/sign-in';
  const verificationRoute = `/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&intent=${intent === 'host' ? 'host' : 'guest'}`;

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setFieldErrors((current) => ({
      ...current,
      email: value.trim() && !isValidEmail(value.trim())
        ? 'Enter a valid email address.'
        : undefined,
    }));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setFieldErrors((current) => ({
      ...current,
      password: value && value.length < 12
        ? 'Use at least 12 characters.'
        : undefined,
      confirmPassword: confirmPassword && confirmPassword !== value
        ? 'Passwords do not match.'
        : undefined,
    }));
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    setFieldErrors((current) => ({
      ...current,
      confirmPassword: value && value !== password
        ? 'Passwords do not match.'
        : undefined,
    }));
  };

  const handleSignUp = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedSiteAddress = siteAddress.trim();
    const normalizedCity = city.trim();
    const normalizedState = state.trim().toUpperCase();
    const normalizedPostalCode = postalCode.trim();
    const hostValidationErrors: typeof fieldErrors = {};

    if (intent === 'host') {
      if (!normalizedFirstName) hostValidationErrors.firstName = 'Enter your first name.';
      if (!normalizedLastName) hostValidationErrors.lastName = 'Enter your last name.';
      if (!normalizedPhone) hostValidationErrors.phone = 'Enter a phone number.';
      else if (!hasValidUsPhoneNumber(normalizedPhone)) hostValidationErrors.phone = phoneNumberHelpText;
      if (!normalizedSiteAddress) hostValidationErrors.siteAddress = 'Enter your home street address.';
      if (!normalizedCity) hostValidationErrors.city = 'Enter your home city.';
      if (!normalizedState) hostValidationErrors.state = 'Enter your home state.';
      if (!normalizedPostalCode) hostValidationErrors.postalCode = 'Enter the ZIP or postal code.';
      if (Object.keys(hostValidationErrors).length) {
        setFieldErrors((current) => ({ ...current, ...hostValidationErrors }));
        Alert.alert('Complete your Hosting Profile', 'Enter your contact information and first-site address before creating your host account.');
        return;
      }
    }

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setFieldErrors((current) => ({
        ...current,
        email: !normalizedEmail ? 'Enter your email address.' : 'Enter a valid email address.',
      }));
      Alert.alert('Check your email address', 'Enter a valid email address before creating your account.');
      return;
    }
 
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
      setFieldErrors((current) => ({ ...current, password: 'Use at least 12 characters.' }));
      Alert.alert(
        'Password is too short',
        'Create a password containing at least 12 characters.'
      );
      return;
    }
 
    if (password !== confirmPassword) {
      setFieldErrors((current) => ({ ...current, confirmPassword: 'Passwords do not match.' }));
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
            ...(intent === 'host' ? {
              host_phone: normalizedPhone,
              host_home_address: normalizedSiteAddress,
              host_home_city: normalizedCity,
              host_home_state: normalizedState,
              host_home_postal_code: normalizedPostalCode,
            } : {}),
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

          {intent === 'host' ? (
            <View style={styles.hostHeading}>
              <Text style={styles.title}>Start Your Hosting Profile</Text>
              <Text style={styles.description}>
                Create your secure host account and enter the first private space you plan to share.
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
                  onChangeText={(value) => { setFirstName(value); setFieldErrors((current) => ({ ...current, firstName: undefined })); }}
                  placeholder="First name"
                  placeholderTextColor="#8A877D"
                  returnKeyType="next"
                  style={styles.input}
                  value={firstName}
                />
                {fieldErrors.firstName ? <Text style={styles.fieldError}>{fieldErrors.firstName}</Text> : null}
              </View>

              <View style={styles.nameField}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  accessibilityLabel="Last name"
                  autoCapitalize="words"
                  autoComplete="name"
                  onChangeText={(value) => { setLastName(value); setFieldErrors((current) => ({ ...current, lastName: undefined })); }}
                  placeholder="Last name"
                  placeholderTextColor="#8A877D"
                  returnKeyType="next"
                  style={styles.input}
                  value={lastName}
                />
                {fieldErrors.lastName ? <Text style={styles.fieldError}>{fieldErrors.lastName}</Text> : null}
              </View>
            </View>

            {intent === 'host' ? <>
              <View>
                <Text style={styles.label}>Phone number</Text>
                <TextInput accessibilityLabel="Phone number" autoComplete="tel" keyboardType="phone-pad" maxLength={12} onChangeText={(value) => { setPhone(formatUsPhoneNumber(value)); setFieldErrors((current) => ({ ...current, phone: undefined })); }} placeholder="248-555-1234" placeholderTextColor="#8A877D" returnKeyType="next" style={[styles.input, fieldErrors.phone && styles.inputError]} value={phone} />
                {fieldErrors.phone ? <Text style={styles.fieldError}>{fieldErrors.phone}</Text> : null}
              </View>
              <View style={styles.siteLocationSection}>
                <Text style={styles.siteLocationTitle}>Home address</Text>
              </View>
              <View>
                <Text style={styles.label}>Street address</Text>
                <TextInput accessibilityLabel="Home street address" autoCapitalize="words" autoComplete="street-address" onChangeText={(value) => { setSiteAddress(value); setFieldErrors((current) => ({ ...current, siteAddress: undefined })); }} placeholder="123 Country Lane" placeholderTextColor="#8A877D" returnKeyType="next" style={[styles.input, fieldErrors.siteAddress && styles.inputError]} value={siteAddress} />
                {fieldErrors.siteAddress ? <Text style={styles.fieldError}>{fieldErrors.siteAddress}</Text> : null}
              </View>
              <View style={styles.locationRow}>
                <View style={styles.cityField}>
                  <Text style={styles.label}>City</Text>
                  <TextInput accessibilityLabel="Home city" autoCapitalize="words" onChangeText={(value) => { setCity(value); setFieldErrors((current) => ({ ...current, city: undefined })); }} placeholder="Your city" placeholderTextColor="#8A877D" returnKeyType="next" style={[styles.input, fieldErrors.city && styles.inputError]} value={city} />
                  {fieldErrors.city ? <Text style={styles.fieldError}>{fieldErrors.city}</Text> : null}
                </View>
                <View style={styles.stateField}>
                  <Text style={styles.label}>State</Text>
                  <TextInput accessibilityLabel="Home state" autoCapitalize="characters" maxLength={2} onChangeText={(value) => { setState(value); setFieldErrors((current) => ({ ...current, state: undefined })); }} placeholder="MI" placeholderTextColor="#8A877D" returnKeyType="next" style={[styles.input, fieldErrors.state && styles.inputError]} value={state} />
                  {fieldErrors.state ? <Text style={styles.fieldError}>{fieldErrors.state}</Text> : null}
                </View>
              </View>
              <View>
                <Text style={styles.label}>ZIP or postal code</Text>
                <TextInput accessibilityLabel="ZIP or postal code" autoCapitalize="characters" keyboardType="number-pad" onChangeText={(value) => { setPostalCode(value); setFieldErrors((current) => ({ ...current, postalCode: undefined })); }} placeholder="ZIP or postal code" placeholderTextColor="#8A877D" returnKeyType="next" style={[styles.input, fieldErrors.postalCode && styles.inputError]} value={postalCode} />
                {fieldErrors.postalCode ? <Text style={styles.fieldError}>{fieldErrors.postalCode}</Text> : null}
              </View>
              <Text style={styles.accountDetailsTitle}>Account sign in</Text>
            </> : null}
 
            <View>
              <Text style={styles.label}>Email address</Text>
 
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={handleEmailChange}
                placeholder="you@example.com"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                style={[styles.input, fieldErrors.email && styles.inputError]}
                value={email}
              />
              {fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
            </View>
 
            <View>
              <Text style={styles.label}>Password</Text>
 
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={handlePasswordChange}
                placeholder="At least 12 characters"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                secureTextEntry={!isPasswordVisible}
                style={[styles.input, fieldErrors.password && styles.inputError]}
                value={password}
              />
              {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
            </View>
 
            <View>
              <Text style={styles.label}>Confirm password</Text>
 
              <TextInput
                accessibilityLabel="Confirm password"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={handleConfirmPasswordChange}
                onSubmitEditing={handleSignUp}
                placeholder="Enter your password again"
                placeholderTextColor="#8A877D"
                returnKeyType="done"
                secureTextEntry={!isPasswordVisible}
                style={[styles.input, fieldErrors.confirmPassword && styles.inputError]}
                value={confirmPassword}
              />
              {fieldErrors.confirmPassword ? <Text style={styles.fieldError}>{fieldErrors.confirmPassword}</Text> : null}

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
                  {intent === 'host' ? 'Create Host Account & Verify Email' : 'Create Account'}
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

  siteLocationSection: { marginTop: 6 },
  siteLocationTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginBottom: 5 },
  siteLocationDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  locationRow: { flexDirection: 'row', gap: 12 },
  cityField: { flex: 1 },
  stateField: { width: 92 },
  accountDetailsTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginTop: 6 },
 
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

  inputError: {
    borderColor: colors.red,
  },

  fieldError: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
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
