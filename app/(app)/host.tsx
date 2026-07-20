import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
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

import { colors, typography } from '../../constants/theme';
import { formatUsPhoneNumber, hasValidUsPhoneNumber, phoneNumberHelpText } from '../../lib/phone-number';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { HostProfile, IdentityVerificationStatus } from '../../types/host-profile';

type HostFieldName =
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'siteAddress'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'profilePhoto'
  | 'confirmations';

function splitFullName(fullName: string) {
  const [firstName = '', ...lastNameParts] = fullName.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(' ') };
}

export default function HostOnboardingScreen() {
  const { isHost, isLoading: isAuthLoading, session } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeState, setHomeState] = useState('');
  const [homePostalCode, setHomePostalCode] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [usesHomeAddress, setUsesHomeAddress] = useState(false);
  const [profileImagePath, setProfileImagePath] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [identityVerificationStatus, setIdentityVerificationStatus] =
    useState<IdentityVerificationStatus>('not_started');
  const [showsVerificationWhy, setShowsVerificationWhy] = useState(false);
  const [controlsProperty, setControlsProperty] = useState(false);
  const [acceptsHostTerms, setAcceptsHostTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<HostFieldName, string>>>({});

  const clearFieldError = (field: HostFieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    const loadHostProfile = async () => {
      if (!session?.user.id) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('host_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        Alert.alert(
          'Unable to load host profile',
          'Please check your connection and try again.'
        );
        setIsLoading(false);
        return;
      }

      const profile = data as HostProfile | null;
      const metadataFirstName = typeof session.user.user_metadata?.first_name === 'string'
        ? session.user.user_metadata.first_name
        : '';
      const metadataLastName = typeof session.user.user_metadata?.last_name === 'string'
        ? session.user.user_metadata.last_name
        : '';
      const metadataNameParts = splitFullName(
        typeof session.user.user_metadata?.full_name === 'string'
          ? session.user.user_metadata.full_name
          : ''
      );

      if (profile) {
        const profileNameParts = splitFullName(profile.full_name);
        setFirstName(profile.first_name || metadataFirstName || profileNameParts.firstName || metadataNameParts.firstName);
        setLastName(profile.last_name || metadataLastName || profileNameParts.lastName || metadataNameParts.lastName);
        setPhone(formatUsPhoneNumber(profile.phone ?? ''));
        setHomeAddress(profile.home_address ?? '');
        setHomeCity(profile.home_city ?? '');
        setHomeState(profile.home_state ?? '');
        setHomePostalCode(profile.home_postal_code ?? '');
        setSiteAddress(profile.primary_site_address ?? '');
        setCity(profile.primary_site_city ?? '');
        setState(profile.primary_site_state ?? '');
        setPostalCode(profile.primary_site_postal_code ?? '');
        setProfileImagePath(profile.profile_image_path);
        setProfileImageUrl(
          profile.profile_image_path
            ? supabase.storage.from('host-profile-images').getPublicUrl(profile.profile_image_path).data.publicUrl
            : null
        );
        setIdentityVerificationStatus(profile.identity_verification_status ?? 'not_started');
        setControlsProperty(profile.controls_property);
        setAcceptsHostTerms(Boolean(profile.accepted_host_terms_at));
      } else {
        setFirstName(metadataFirstName || metadataNameParts.firstName);
        setLastName(metadataLastName || metadataNameParts.lastName);
        setPhone(formatUsPhoneNumber(typeof session.user.user_metadata?.host_phone === 'string' ? session.user.user_metadata.host_phone : ''));
        setHomeAddress(typeof session.user.user_metadata?.host_home_address === 'string' ? session.user.user_metadata.host_home_address : '');
        setHomeCity(typeof session.user.user_metadata?.host_home_city === 'string' ? session.user.user_metadata.host_home_city : '');
        setHomeState(typeof session.user.user_metadata?.host_home_state === 'string' ? session.user.user_metadata.host_home_state : '');
        setHomePostalCode(typeof session.user.user_metadata?.host_home_postal_code === 'string' ? session.user.user_metadata.host_home_postal_code : '');
      }

      setIsLoading(false);
    };

    void loadHostProfile();
  }, [
    session?.user.id,
    session?.user.user_metadata?.first_name,
    session?.user.user_metadata?.full_name,
    session?.user.user_metadata?.host_phone,
    session?.user.user_metadata?.host_home_address,
    session?.user.user_metadata?.host_home_city,
    session?.user.user_metadata?.host_home_postal_code,
    session?.user.user_metadata?.host_home_state,
    session?.user.user_metadata?.last_name,
  ]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!session?.user.id) {
      router.replace('/sign-in?intent=host');
      return;
    }

    if (!isHost) {
      router.dismissAll();
      router.replace('/dashboard');
    }
  }, [isAuthLoading, isHost, session?.user.id]);

  const handleUseHomeAddress = () => {
    setUsesHomeAddress((current) => {
      const next = !current;

      if (next) {
        setSiteAddress(homeAddress);
        setCity(homeCity);
        setState(homeState);
        setPostalCode(homePostalCode);
        clearFieldError('siteAddress');
        clearFieldError('city');
        clearFieldError('state');
        clearFieldError('postalCode');
      }

      return next;
    });
  };

  const canUseHomeAddress = Boolean(homeAddress && homeCity && homeState && homePostalCode);

  const uploadProfilePhoto = async () => {
    if (!session?.user.id || isUploadingProfilePhoto) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to upload the host photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    try {
      setIsUploadingProfilePhoto(true);
      const asset = result.assets[0];
      const rawExtension = asset.fileName?.split('.').pop() ?? asset.mimeType?.split('/').pop() ?? 'jpg';
      const extension = rawExtension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const path = `${session.user.id}/host-photo-${Date.now()}.${extension}`;
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('host-profile-images')
        .upload(path, arrayBuffer, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      setProfileImagePath(path);
      setProfileImageUrl(supabase.storage.from('host-profile-images').getPublicUrl(path).data.publicUrl);
      clearFieldError('profilePhoto');
    } catch (error) {
      Alert.alert(
        'Unable to upload photo',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsUploadingProfilePhoto(false);
    }
  };

  const handleContinue = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const normalizedPhone = phone.trim();
    const normalizedSiteAddress = siteAddress.trim();
    const normalizedCity = city.trim();
    const normalizedState = state.trim();
    const normalizedPostalCode = postalCode.trim();

    if (!session?.user.id) {
      Alert.alert('Sign in required', 'Please sign in before becoming a host.');
      return;
    }

    const validationErrors: Partial<Record<HostFieldName, string>> = {};
    if (!normalizedFirstName) validationErrors.firstName = 'Enter your first name.';
    if (!normalizedLastName) validationErrors.lastName = 'Enter your last name.';
    if (!normalizedPhone) validationErrors.phone = 'Enter a phone number.';
    else if (!hasValidUsPhoneNumber(normalizedPhone)) validationErrors.phone = phoneNumberHelpText;
    if (!normalizedSiteAddress) validationErrors.siteAddress = 'Enter the private space street address.';
    if (!normalizedCity) validationErrors.city = 'Enter the private space city.';
    if (!normalizedState) validationErrors.state = 'Enter the private space state.';
    if (!normalizedPostalCode) validationErrors.postalCode = 'Enter the ZIP or postal code.';
    if (!profileImagePath) validationErrors.profilePhoto = 'Upload the host photo before continuing.';
    if (!controlsProperty || !acceptsHostTerms) {
      validationErrors.confirmations = 'Check both confirmations before continuing.';
    }

    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      return;
    }

    try {
      setIsSubmitting(true);

      const completedAt = new Date().toISOString();

      const { error } = await supabase.from('host_profiles').upsert(
        {
          user_id: session.user.id,
          full_name: normalizedName,
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
          email: session.user.email?.trim().toLowerCase() ?? null,
          phone: normalizedPhone,
          profile_image_path: profileImagePath,
          primary_site_address: normalizedSiteAddress,
          primary_site_city: normalizedCity,
          primary_site_state: normalizedState.toUpperCase(),
          primary_site_postal_code: normalizedPostalCode,
          controls_property: true,
          accepted_host_terms_at: completedAt,
          onboarding_completed_at: completedAt,
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        Alert.alert('Unable to save host profile', error.message);
        return;
      }

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedName,
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
        },
      });

      if (authUpdateError) {
        Alert.alert('Unable to update account name', authUpdateError.message);
        return;
      }

      router.replace('/host-dashboard');
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not save your host profile. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading || !session?.user.id || !isHost || isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#263A24" />
          <Text style={styles.stateText}>Loading host setup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headingArea}>
            <Text style={styles.title}>Hosting Profile</Text>
            <Text style={styles.description}>
              Start with a few details about yourself. You’ll add property information,
              photos, access instructions, and availability next.
            </Text>
          </View>

          <View style={styles.form}>
            {Object.keys(fieldErrors).length ? (
              <View style={styles.validationBanner}>
                <Text style={styles.validationBannerTitle}>Please review the highlighted fields.</Text>
                <Text style={styles.validationBannerText}>Each item below explains exactly what is needed.</Text>
              </View>
            ) : null}
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <FormField
                  label="First name"
                  value={firstName}
                  onChangeText={(value) => { setFirstName(value); clearFieldError('firstName'); }}
                  placeholder="First name"
                  autoComplete="name"
                  autoCapitalize="words"
                  error={fieldErrors.firstName}
                />
              </View>
              <View style={styles.nameField}>
                <FormField
                  label="Last name"
                  value={lastName}
                  onChangeText={(value) => { setLastName(value); clearFieldError('lastName'); }}
                  placeholder="Last name"
                  autoComplete="name"
                  autoCapitalize="words"
                  error={fieldErrors.lastName}
                />
              </View>
            </View>
            <FormField
              label="Phone number"
              value={phone}
              onChangeText={(value) => { setPhone(formatUsPhoneNumber(value)); clearFieldError('phone'); }}
              placeholder="248-555-1234"
              autoComplete="tel"
              keyboardType="phone-pad"
              maxLength={12}
              error={fieldErrors.phone}
            />
            <View style={[styles.hostPhotoCard, fieldErrors.profilePhoto && styles.hostPhotoCardError]}>
              <View style={styles.hostPhotoCopy}>
                <Text style={styles.hostPhotoTitle}>Host photo</Text>
                <Text style={styles.hostPhotoRequired}>REQUIRED</Text>
                <Text style={styles.hostPhotoDescription}>
                  Upload a clear photo of the individual managing this site. Members will see this same photo on your Host Profile and in messages.
                </Text>
              </View>
              <Pressable
                accessibilityLabel={profileImageUrl ? 'Change host photo' : 'Upload host photo'}
                accessibilityRole="button"
                disabled={isUploadingProfilePhoto}
                onPress={() => void uploadProfilePhoto()}
                style={({ pressed }) => [styles.hostPhotoButton, pressed && styles.buttonPressed, isUploadingProfilePhoto && styles.buttonDisabled]}
              >
                {isUploadingProfilePhoto ? <ActivityIndicator color={colors.warmWhite} /> : profileImageUrl ? <Image contentFit="cover" source={{ uri: profileImageUrl }} style={styles.hostPhotoPreview} /> : <Text style={styles.hostPhotoButtonText}>Upload Photo</Text>}
              </Pressable>
              {fieldErrors.profilePhoto ? <Text style={styles.fieldErrorText}>{fieldErrors.profilePhoto}</Text> : null}
            </View>
            <View style={styles.siteLocationSection}>
              <Text style={styles.siteLocationTitle}>First Private Space</Text>
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: usesHomeAddress, disabled: !canUseHomeAddress }}
              disabled={!canUseHomeAddress}
              onPress={handleUseHomeAddress}
              style={({ pressed }) => [
                styles.useHomeAddressCard,
                pressed && canUseHomeAddress && styles.buttonPressed,
                !canUseHomeAddress && styles.useHomeAddressCardDisabled,
              ]}
            >
              <View style={[styles.checkbox, usesHomeAddress && styles.checkboxChecked]}>
                {usesHomeAddress ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <View style={styles.useHomeAddressCopy}>
                <Text style={styles.useHomeAddressTitle}>Use my home address for this private space</Text>
                <Text style={styles.useHomeAddressDescription}>
                  {canUseHomeAddress
                    ? 'You can edit the address below if this space is located elsewhere. Once you log in to your Host Dashboard, you can add additional private spaces.'
                    : 'Enter the address for the first private space you plan to list. Once you log in to your Host Dashboard, you can add additional private spaces.'}
                </Text>
              </View>
            </Pressable>
            <FormField
              label="Street Address"
              value={siteAddress}
              onChangeText={(value) => { setSiteAddress(value); setUsesHomeAddress(false); clearFieldError('siteAddress'); }}
              placeholder="123 Country Lane"
              autoComplete="street-address"
              autoCapitalize="words"
              error={fieldErrors.siteAddress}
            />
            <View style={styles.locationRow}>
              <View style={styles.cityField}>
                <FormField
                  label="City"
                  value={city}
                  onChangeText={(value) => { setCity(value); setUsesHomeAddress(false); clearFieldError('city'); }}
                  placeholder="Your city"
                  autoCapitalize="words"
                  error={fieldErrors.city}
                />
              </View>
              <View style={styles.stateField}>
                <FormField
                  label="State"
                  value={state}
                  onChangeText={(value) => { setState(value); setUsesHomeAddress(false); clearFieldError('state'); }}
                  placeholder="State"
                  autoCapitalize="characters"
                  maxLength={2}
                  error={fieldErrors.state}
                />
              </View>
            </View>
            <FormField
              label="ZIP or postal code"
              value={postalCode}
              onChangeText={(value) => { setPostalCode(value); setUsesHomeAddress(false); clearFieldError('postalCode'); }}
              placeholder="ZIP or postal code"
              autoCapitalize="characters"
              keyboardType="number-pad"
              error={fieldErrors.postalCode}
            />
            <View style={styles.identityCard}>
              <View style={styles.identityHeader}>
                <Text style={styles.identityTitle}>Stripe Identity verification</Text>
                <View style={styles.identityRequiredBadge}>
                  <Text style={styles.identityRequiredText}>REQUIRED</Text>
                </View>
              </View>
              <Text style={styles.identityDescription}>
                Before your first site can be approved and published, you will need to verify your identity through Stripe’s secure verification process.
              </Text>
              <Text style={styles.identityStatusText}>
                {identityVerificationStatus === 'verified'
                  ? 'Identity verified'
                  : 'Verification will be available after Stripe Identity is connected.'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showsVerificationWhy }}
              onPress={() => setShowsVerificationWhy((current) => !current)}
              style={({ pressed }) => [styles.verificationWhyButton, pressed && styles.buttonPressed]}
            >
              <View style={styles.verificationWhyIcon}>
                <Text style={styles.verificationWhyIconText}>?</Text>
              </View>
              <Text style={styles.verificationWhyButtonText}>Why do we request verification?</Text>
              <Text style={styles.verificationWhyChevron}>{showsVerificationWhy ? '−' : '+'}</Text>
            </Pressable>
            {showsVerificationWhy ? (
              <View style={styles.verificationWhyContent}>
                <Text style={styles.verificationWhyTitle}>Why Identity Verification Matters</Text>
                <Text style={styles.verificationWhyText}>
                  At K9 Country, trust is the foundation of our community. Every host completes a secure identity verification before listing a property to help protect members, homeowners, and the integrity of our platform.
                </Text>
                <Text style={styles.verificationWhyLead}>Identity verification helps us:</Text>
                <View style={styles.verificationBenefits}>
                  <VerificationBenefit text="Confirm that each host is a real person." />
                  <VerificationBenefit text="Reduce fraudulent accounts and unauthorized listings." />
                  <VerificationBenefit text="Build confidence between hosts and members." />
                  <VerificationBenefit text="Create a safer, more trusted experience for everyone." />
                </View>
                <Text style={styles.verificationWhyText}>
                  To keep this process fair, hosts pay the verification fee directly through our secure verification provider during registration. Once you successfully complete your first booking, K9 Country will reimburse your verification fee as a thank-you for becoming a verified, active host.
                </Text>
                <Text style={styles.verificationWhyClosing}>
                  This is more than a verification process—it&apos;s a commitment to creating one of the safest and most trusted private dog communities anywhere.
                </Text>
              </View>
            ) : null}

            <View style={[styles.confirmationCard, fieldErrors.confirmations && styles.confirmationCardError]}>
              <ConfirmationRow
                checked={controlsProperty}
                label="I own this property or have permission to list and host it."
                onPress={() => { setControlsProperty((current) => !current); clearFieldError('confirmations'); }}
              />
              <View style={styles.confirmationDivider} />
              <ConfirmationRow
                checked={acceptsHostTerms}
                label="I agree to provide accurate listing details and follow K9 Country host requirements."
                onPress={() => { setAcceptsHostTerms((current) => !current); clearFieldError('confirmations'); }}
              />
              {fieldErrors.confirmations ? <Text style={styles.fieldErrorText}>{fieldErrors.confirmations}</Text> : null}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleContinue}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isSubmitting && styles.buttonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFDF8" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue to Create Property</Text>
              )}
            </Pressable>

            <Text style={styles.footerText}>
              Your host profile is submitted for review. You can create a
              property draft next, but it cannot be published until approved.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function VerificationBenefit({ text }: { text: string }) {
  return (
    <View style={styles.verificationBenefitRow}>
      <View style={styles.verificationBenefitBullet} />
      <Text style={styles.verificationBenefitText}>{text}</Text>
    </View>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'name' | 'tel' | 'street-address';
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  maxLength?: number;
  error?: string;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'sentences',
  autoComplete,
  keyboardType = 'default',
  maxLength,
  error,
}: FormFieldProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A877D"
        style={[styles.input, error && styles.inputError]}
        value={value}
      />
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

function ConfirmationRow({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.confirmationRow}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={styles.confirmationText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 36 },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stateText: { color: colors.muted, fontSize: 15, marginTop: 14 },
  headingArea: { alignItems: 'center', marginBottom: 26 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 29, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 370 },
  form: { gap: 18 },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameField: { flex: 1 },
  hostPhotoCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 15 },
  hostPhotoCardError: { borderColor: colors.red, borderWidth: 2 },
  hostPhotoCopy: { flex: 1, minWidth: 180 },
  hostPhotoTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  hostPhotoRequired: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginTop: 3 },
  hostPhotoDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  hostPhotoButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, height: 86, justifyContent: 'center', overflow: 'hidden', width: 86 },
  hostPhotoPreview: { height: '100%', width: '100%' },
  hostPhotoButtonText: { color: colors.warmWhite, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  siteLocationSection: { marginTop: 2 },
  siteLocationTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  useHomeAddressCard: { alignItems: 'flex-start', backgroundColor: '#EEF3E7', borderColor: '#C7D4B8', borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 14 },
  useHomeAddressCardDisabled: { backgroundColor: '#F4F1E9', borderColor: colors.border, opacity: 0.82 },
  useHomeAddressCopy: { flex: 1 },
  useHomeAddressTitle: { color: colors.forest, fontSize: 14, fontWeight: '900', lineHeight: 20 },
  useHomeAddressDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  identityCard: { backgroundColor: '#EEF3E7', borderColor: '#C7D4B8', borderRadius: 16, borderWidth: 1, gap: 8, padding: 16 },
  identityHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  identityTitle: { color: colors.forest, flex: 1, fontSize: 16, fontWeight: '900' },
  identityRequiredBadge: { backgroundColor: colors.forest, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  identityRequiredText: { color: colors.warmWhite, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  identityDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  identityStatusText: { color: colors.olive, fontSize: 13, fontWeight: '800' },
  verificationWhyButton: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 6, paddingVertical: 2 },
  verificationWhyIcon: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 10, height: 20, justifyContent: 'center', width: 20 },
  verificationWhyIconText: { color: colors.warmWhite, fontSize: 13, fontWeight: '900' },
  verificationWhyButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900', textDecorationLine: 'underline' },
  verificationWhyChevron: { color: colors.forest, fontSize: 20, fontWeight: '700', lineHeight: 20 },
  verificationWhyContent: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 13, padding: 18 },
  verificationWhyTitle: { color: colors.forest, fontFamily: typography.display, fontSize: 21, fontWeight: '900', lineHeight: 27 },
  verificationWhyText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  verificationWhyLead: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: -3 },
  verificationBenefits: { gap: 9 },
  verificationBenefitRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 9 },
  verificationBenefitBullet: { backgroundColor: colors.olive, borderRadius: 4, height: 7, marginTop: 7, width: 7 },
  verificationBenefitText: { color: colors.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  verificationWhyClosing: { color: colors.forest, fontSize: 14, fontStyle: 'italic', fontWeight: '800', lineHeight: 21 },
  label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.warmWhite, color: colors.forest, fontSize: 16, paddingHorizontal: 16 },
  inputError: { borderColor: colors.red, borderWidth: 2 },
  fieldErrorText: { color: colors.red, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 6 },
  validationBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 14, borderWidth: 1, gap: 3, padding: 14 },
  validationBannerTitle: { color: colors.red, fontSize: 15, fontWeight: '900' },
  validationBannerText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  locationRow: { flexDirection: 'row', gap: 12 },
  cityField: { flex: 1 },
  stateField: { width: 88 },
  confirmationCard: { borderColor: colors.border, borderRadius: 16, borderWidth: 1, backgroundColor: colors.warmWhite, paddingHorizontal: 16 },
  confirmationCardError: { borderColor: colors.red, borderWidth: 2 },
  confirmationRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 16 },
  checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderColor: colors.brown, borderRadius: 6, borderWidth: 2, marginRight: 12, marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.forest, borderColor: colors.forest },
  checkmark: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  confirmationText: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 21 },
  confirmationDivider: { height: 1, backgroundColor: colors.border },
  primaryButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.brown, marginTop: 2, paddingHorizontal: 16 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.65 },
  footerText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
