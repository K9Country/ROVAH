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
import { SmsConsent } from '../../components/sms-consent';
import { formatUsPhoneNumber, hasValidUsPhoneNumber, phoneNumberHelpText } from '../../lib/phone-number';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { HostProfile, IdentityVerificationStatus } from '../../types/host-profile';

type HostFieldName =
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'homeAddress'
  | 'homeCity'
  | 'homeState'
  | 'homePostalCode'
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

function normalizeNameParts(firstName: string, lastName: string, fullName = '') {
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();

  if (normalizedFirstName && normalizedFirstName === normalizedLastName) {
    return splitFullName(normalizedFirstName);
  }

  if (normalizedFirstName || normalizedLastName) {
    return { firstName: normalizedFirstName, lastName: normalizedLastName };
  }

  return splitFullName(fullName);
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
  const identityVerificationStatus: IdentityVerificationStatus = 'not_started';
  const [showsVerificationWhy, setShowsVerificationWhy] = useState(false);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [controlsProperty, setControlsProperty] = useState(false);
  const [acceptsHostTerms, setAcceptsHostTerms] = useState(false);
  const [smsUpdates, setSmsUpdates] = useState(false);
  const [savedSmsUpdates, setSavedSmsUpdates] = useState(false);
  const [consentedSmsPhone, setConsentedSmsPhone] = useState('');
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
      const metadataFullName = typeof session.user.user_metadata?.full_name === 'string'
        ? session.user.user_metadata.full_name
        : '';
      const metadataNameParts = splitFullName(
        metadataFullName
      );

      if (profile) {
        const profileNameParts = normalizeNameParts(profile.first_name ?? '', profile.last_name ?? '', profile.full_name);
        const normalizedMetadataName = normalizeNameParts(metadataFirstName, metadataLastName, metadataFullName);
        setFirstName(profileNameParts.firstName || normalizedMetadataName.firstName);
        setLastName(profileNameParts.lastName || normalizedMetadataName.lastName);
        setPhone(formatUsPhoneNumber(profile.phone ?? ''));
        setHomeAddress(profile.home_address ?? '');
        setHomeCity(profile.home_city ?? '');
        setHomeState(profile.home_state ?? '');
        setHomePostalCode(profile.home_postal_code ?? '');
        setProfileImagePath(profile.profile_image_path);
        setProfileImageUrl(
          profile.profile_image_path
            ? supabase.storage.from('host-profile-images').getPublicUrl(profile.profile_image_path).data.publicUrl
            : null
        );
        setControlsProperty(profile.controls_property);
        setAcceptsHostTerms(Boolean(profile.accepted_host_terms_at));
      } else {
        const normalizedMetadataName = normalizeNameParts(metadataFirstName, metadataLastName, metadataFullName);
        setFirstName(normalizedMetadataName.firstName || metadataNameParts.firstName);
        setLastName(normalizedMetadataName.lastName || metadataNameParts.lastName);
        setPhone(formatUsPhoneNumber(typeof session.user.user_metadata?.host_phone === 'string' ? session.user.user_metadata.host_phone : ''));
        setHomeAddress(typeof session.user.user_metadata?.host_home_address === 'string' ? session.user.user_metadata.host_home_address : '');
        setHomeCity(typeof session.user.user_metadata?.host_home_city === 'string' ? session.user.user_metadata.host_home_city : '');
        setHomeState(typeof session.user.user_metadata?.host_home_state === 'string' ? session.user.user_metadata.host_home_state : '');
        setHomePostalCode(typeof session.user.user_metadata?.host_home_postal_code === 'string' ? session.user.user_metadata.host_home_postal_code : '');
      }

      const { data: smsPreference } = await supabase.from('sms_notification_preferences').select('sms_updates, consented_phone').eq('user_id', session.user.id).maybeSingle();
      const enabled = Boolean(smsPreference?.sms_updates);
      setSmsUpdates(enabled);
      setSavedSmsUpdates(enabled);
      setConsentedSmsPhone(smsPreference?.consented_phone ?? '');

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

  const handleUseHomeAddress = () => {
    setUsesHomeAddress((current) => {
      const next = !current;
      if (next) {
        setSiteAddress(homeAddress);
        setCity(homeCity);
        setState(homeState);
        setPostalCode(homePostalCode);
      }
      return next;
    });
  };

  const canUseHomeAddress = Boolean(homeAddress && homeCity && homeState && homePostalCode);

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
    const { firstName: normalizedFirstName, lastName: normalizedLastName } = normalizeNameParts(firstName, lastName);
    const normalizedName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const normalizedPhone = phone.trim();
    const normalizedHomeAddress = homeAddress.trim();
    const normalizedHomeCity = homeCity.trim();
    const normalizedHomeState = homeState.trim();
    const normalizedHomePostalCode = homePostalCode.trim();

    if (!session?.user.id) {
      Alert.alert('Sign in required', 'Please sign in before becoming a host.');
      return;
    }

    const validationErrors: Partial<Record<HostFieldName, string>> = {};
    if (!normalizedFirstName) validationErrors.firstName = 'Enter your first name.';
    if (!normalizedLastName) validationErrors.lastName = 'Enter your last name.';
    if (!normalizedPhone) validationErrors.phone = 'Enter a phone number.';
    else if (!hasValidUsPhoneNumber(normalizedPhone)) validationErrors.phone = phoneNumberHelpText;
    if (!normalizedHomeAddress) validationErrors.homeAddress = 'Enter your home street address.';
    if (!normalizedHomeCity) validationErrors.homeCity = 'Enter your home city.';
    if (!normalizedHomeState) validationErrors.homeState = 'Enter your home state.';
    if (!normalizedHomePostalCode) validationErrors.homePostalCode = 'Enter your home ZIP or postal code.';
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
          home_address: normalizedHomeAddress,
          home_city: normalizedHomeCity,
          home_state: normalizedHomeState.toUpperCase(),
          home_postal_code: normalizedHomePostalCode,
          profile_image_path: profileImagePath,
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

      if (smsUpdates !== savedSmsUpdates || (smsUpdates && normalizedPhone !== consentedSmsPhone)) {
        const { error: smsError } = await supabase.rpc('set_sms_notification_preference', { p_enabled: smsUpdates, p_phone: normalizedPhone, p_source: 'profile' });
        if (smsError) {
          Alert.alert('Host profile saved', 'Your SMS preference could not be saved. Please try again.');
          return;
        }
        setSavedSmsUpdates(smsUpdates);
        if (smsUpdates) setConsentedSmsPhone(normalizedPhone);
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

      void supabase.functions
        .invoke('notify-app-email', {
          body: { type: 'host_profile_created', resourceId: session.user.id },
        })
        .then(({ error: notificationError }) => {
          if (notificationError) {
            console.warn('Host profile notification email was not sent:', notificationError.message);
          }
        })
        .catch((notificationError) => {
          console.warn('Host profile notification email was not sent:', notificationError);
        });

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
          <View style={styles.hostHeroBleed}>
            <Image
              accessibilityLabel="ROVAH host profile artwork"
              contentFit="cover"
              contentPosition="top"
              source={require('../../assets/images/rovah-host-profile-header.png')}
              style={styles.hostHero}
            />
          </View>
          <View style={styles.headingArea}>
            <Text style={styles.title}>Start Your Host Profile</Text>
            <Text style={styles.description}>
              Your personal details stay private to ROVAH for account, safety, and verification records.
              You will add each private space separately from your Host Dashboard.
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
                  autoComplete="given-name"
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
                  autoComplete="family-name"
                  autoCapitalize="words"
                  error={fieldErrors.lastName}
                />
              </View>
            </View>
            <FormField
              label="Phone number"
              value={phone}
              onChangeText={(value) => { const next = formatUsPhoneNumber(value); setPhone(next); if (next !== consentedSmsPhone) setSmsUpdates(false); clearFieldError('phone'); }}
              placeholder="248-555-1234"
              autoComplete="tel"
              keyboardType="phone-pad"
              maxLength={12}
              error={fieldErrors.phone}
            />
            <SmsConsent checked={smsUpdates} onChange={setSmsUpdates} />
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
            <View style={styles.homeAddressSection}>
              <Text style={styles.siteLocationTitle}>Personal Home Address</Text>
              <Text style={styles.homeAddressRequired}>REQUIRED</Text>
              <Text style={styles.homeAddressDescription}>
                This address is private to ROVAH for host account, safety, and verification records. It is never shown on your public property listing.
              </Text>
            </View>
            <FormField
              label="Home Street Address"
              value={homeAddress}
              onChangeText={(value) => {
                setHomeAddress(value);
                clearFieldError('homeAddress');
              }}
              placeholder="123 Country Lane"
              autoComplete="street-address"
              autoCapitalize="words"
              error={fieldErrors.homeAddress}
            />
            <View style={styles.locationRow}>
              <View style={styles.cityField}>
                <FormField
                  label="Home City"
                  value={homeCity}
                  onChangeText={(value) => {
                    setHomeCity(value);
                    clearFieldError('homeCity');
                  }}
                  placeholder="Your city"
                  autoCapitalize="words"
                  error={fieldErrors.homeCity}
                />
              </View>
              <View style={styles.stateField}>
                <FormField
                  label="Home State"
                  value={homeState}
                  onChangeText={(value) => {
                    setHomeState(value);
                    clearFieldError('homeState');
                  }}
                  placeholder="State"
                  autoCapitalize="characters"
                  maxLength={2}
                  error={fieldErrors.homeState}
                />
              </View>
            </View>
            <FormField
              label="Home ZIP or Postal Code"
              value={homePostalCode}
              onChangeText={(value) => {
                setHomePostalCode(value);
                clearFieldError('homePostalCode');
              }}
              placeholder="ZIP or postal code"
              autoCapitalize="characters"
              keyboardType="number-pad"
              error={fieldErrors.homePostalCode}
            />
            {false ? <>
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
                <Text style={styles.identityTitle}>Payout verification</Text>
              </View>
              <Text style={styles.identityDescription}>
                When ROVAH payments are active, Stripe will securely collect the identity, tax, and bank details needed for your monthly host payouts.
              </Text>
              <Text style={styles.identityStatusText}>
                {identityVerificationStatus === 'verified'
                  ? 'Payout verification complete'
                  : 'Payout setup will be available here after Stripe is connected.'}
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
                  At ROVAH, trust is the foundation of our community. When payouts are active, hosts complete Stripe’s secure payout onboarding before receiving a monthly payout.
                </Text>
                <Text style={styles.verificationWhyLead}>Identity verification helps us:</Text>
                <View style={styles.verificationBenefits}>
                  <VerificationBenefit text="Confirm that each host is a real person." />
                  <VerificationBenefit text="Reduce fraudulent accounts and unauthorized listings." />
                  <VerificationBenefit text="Build confidence between hosts and members." />
                  <VerificationBenefit text="Create a safer, more trusted experience for everyone." />
                </View>
                <Text style={styles.verificationWhyText}>
                  Stripe collects the information required to verify the payout account. ROVAH does not store a host’s bank or tax information in the app.
                </Text>
                <Text style={styles.verificationWhyClosing}>
                  This is more than a verification process—it&apos;s a commitment to creating one of the safest and most trusted private dog communities anywhere.
                </Text>
              </View>
            ) : null}

            </> : null}
            <View style={[styles.confirmationCard, fieldErrors.confirmations && styles.confirmationCardError]}>
              <ConfirmationRow
                checked={controlsProperty}
                label="I own this property or have permission to list and host it."
                onPress={() => { setControlsProperty((current) => !current); clearFieldError('confirmations'); }}
              />
              <View style={styles.confirmationDivider} />
              <ConfirmationRow
                checked={acceptsHostTerms}
                label="I agree to provide accurate listing details and follow ROVAH host requirements."
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
                <Text style={styles.primaryButtonText}>Complete Host Profile</Text>
              )}
            </Pressable>

            <Text style={styles.footerText}>
              Next, add a private space from your Host Dashboard. A site remains private until ROVAH approves it and secure Stripe payouts are complete.
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
  autoComplete?: 'given-name' | 'family-name' | 'name' | 'tel' | 'street-address';
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
  // Sampled from the lower fade of rovah-host-profile-header.png so the
  // artwork blends directly into the profile form without a visible edge.
  safeArea: { flex: 1, backgroundColor: '#F5EDE7' },
  keyboardView: { flex: 1, backgroundColor: '#F5EDE7' },
  container: { backgroundColor: '#F5EDE7', paddingHorizontal: 24, paddingTop: 0, paddingBottom: 36 },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stateText: { color: colors.muted, fontSize: 15, marginTop: 14 },
  hostHeroBleed: { alignSelf: 'stretch', marginHorizontal: -24, marginBottom: 24 },
  hostHero: { aspectRatio: 3 / 4, width: '100%' },
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
  homeAddressSection: { backgroundColor: '#EEF3E7', borderColor: '#C7D4B8', borderRadius: 16, borderWidth: 1, gap: 4, padding: 16 },
  homeAddressRequired: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  homeAddressDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
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
