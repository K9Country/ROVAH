import AsyncStorage from '@react-native-async-storage/async-storage';
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
import type { HostProfile } from '../../types/host-profile';

function splitFullName(fullName: string) {
  const [firstName = '', ...lastNameParts] = fullName.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(' ') };
}

export default function HostOnboardingScreen() {
  const { isLoading: isAuthLoading, session } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [controlsProperty, setControlsProperty] = useState(false);
  const [acceptsHostTerms, setAcceptsHostTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        setCity(profile.city ?? '');
        setState(profile.state ?? '');
        setControlsProperty(profile.controls_property);
        setAcceptsHostTerms(Boolean(profile.accepted_host_terms_at));
      } else {
        setFirstName(metadataFirstName || metadataNameParts.firstName);
        setLastName(metadataLastName || metadataNameParts.lastName);
      }

      setIsLoading(false);
    };

    void loadHostProfile();
  }, [session?.user.id]);

  useEffect(() => {
    if (isAuthLoading || session?.user.id) {
      return;
    }

    router.replace('/sign-in?intent=host');
  }, [isAuthLoading, session?.user.id]);

  const handleContinue = async () => {
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const normalizedPhone = phone.trim();
    const normalizedCity = city.trim();
    const normalizedState = state.trim();

    if (!session?.user.id) {
      Alert.alert('Sign in required', 'Please sign in before becoming a host.');
      return;
    }

    if (!normalizedFirstName || !normalizedLastName || !normalizedPhone || !normalizedCity || !normalizedState) {
      Alert.alert(
        'Missing information',
        'Complete your first name, last name, phone number, city, and state.'
      );
      return;
    }

    if (!hasValidUsPhoneNumber(normalizedPhone)) {
      Alert.alert('Phone number needed', phoneNumberHelpText);
      return;
    }

    if (!controlsProperty || !acceptsHostTerms) {
      Alert.alert(
        'Confirmation required',
        'Confirm that you control the property and agree to the host requirements.'
      );
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
          city: normalizedCity,
          state: normalizedState.toUpperCase(),
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

      await AsyncStorage.setItem('@k9-country/host-mode', 'host');
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

  if (isAuthLoading || !session?.user.id || isLoading) {
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
            <Text style={styles.title}>Share your private space</Text>
            <Text style={styles.description}>
              Start with a few details. You’ll add your property information,
              photos, access instructions, and availability next.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <FormField
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  autoComplete="name"
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.nameField}>
                <FormField
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  autoComplete="name"
                  autoCapitalize="words"
                />
              </View>
            </View>
            <FormField
              label="Phone number"
              value={phone}
              onChangeText={(value) => setPhone(formatUsPhoneNumber(value))}
              placeholder="248-555-1234"
              autoComplete="tel"
              keyboardType="phone-pad"
              maxLength={12}
            />
            <View style={styles.locationRow}>
              <View style={styles.cityField}>
                <FormField
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  placeholder="Your city"
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.stateField}>
                <FormField
                  label="State"
                  value={state}
                  onChangeText={setState}
                  placeholder="State"
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
            </View>

            <View style={styles.confirmationCard}>
              <ConfirmationRow
                checked={controlsProperty}
                label="I own this property or have permission to list and host it."
                onPress={() => setControlsProperty((current) => !current)}
              />
              <View style={styles.confirmationDivider} />
              <ConfirmationRow
                checked={acceptsHostTerms}
                label="I agree to provide accurate listing details and follow K9 Country host requirements."
                onPress={() => setAcceptsHostTerms((current) => !current)}
              />
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

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'name' | 'tel';
  keyboardType?: 'default' | 'phone-pad';
  maxLength?: number;
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
        style={styles.input}
        value={value}
      />
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
  label: { color: colors.forest, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.warmWhite, color: colors.forest, fontSize: 16, paddingHorizontal: 16 },
  locationRow: { flexDirection: 'row', gap: 12 },
  cityField: { flex: 1 },
  stateField: { width: 88 },
  confirmationCard: { borderColor: colors.border, borderRadius: 16, borderWidth: 1, backgroundColor: colors.warmWhite, paddingHorizontal: 16 },
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
