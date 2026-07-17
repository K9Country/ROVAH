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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type HostAccess = {
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  is_active: boolean;
  primary_site_address: string | null;
  primary_site_city: string | null;
  primary_site_state: string | null;
  primary_site_postal_code: string | null;
};

export default function CreatePropertyScreen() {
  const { session } = useAuth();
  const [hostAccess, setHostAccess] = useState<HostAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [acreage, setAcreage] = useState('');
  const [isFullyFenced, setIsFullyFenced] = useState(false);
  const [fenceHeightFeet, setFenceHeightFeet] = useState('');
  const [instantBook, setInstantBook] = useState(false);

  useEffect(() => {
    const loadHostAccess = async () => {
      if (!session?.user.id) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('host_profiles')
        .select('status, is_active, primary_site_address, primary_site_city, primary_site_state, primary_site_postal_code')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        Alert.alert('Unable to load host profile', error.message);
      } else {
        const profile = data as HostAccess | null;
        setHostAccess(profile);

        if (profile) {
          setSiteAddress(profile.primary_site_address ?? '');
          setCity(profile.primary_site_city ?? '');
          setState(profile.primary_site_state ?? '');
          setPostalCode(profile.primary_site_postal_code ?? '');
        }
      }

      setIsLoading(false);
    };

    void loadHostAccess();
  }, [session?.user.id]);

  const validateForm = () => {
    const price = Number(pricePerHour);
    const parsedAcreage = acreage.trim() ? Number(acreage) : null;
    const parsedFenceHeight = fenceHeightFeet.trim()
      ? Number(fenceHeightFeet)
      : null;

    if (name.trim().length < 3) {
      Alert.alert('Property name required', 'Enter a name with at least 3 characters.');
      return false;
    }

    if (shortDescription.trim().length < 20) {
      Alert.alert(
        'Add a little more detail',
        'Use at least 20 characters to describe the space for guests.'
      );
      return false;
    }

    if (!siteAddress.trim() || !city.trim() || state.trim().length !== 2 || !postalCode.trim()) {
      Alert.alert(
        'Location required',
        'Enter the site street address, city, two-letter state, and ZIP or postal code.'
      );
      return false;
    }

    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('Valid price required', 'Enter a price per hour greater than $0.');
      return false;
    }

    if (parsedAcreage !== null && (!Number.isFinite(parsedAcreage) || parsedAcreage < 0)) {
      Alert.alert('Invalid acreage', 'Acreage must be a positive number or left blank.');
      return false;
    }

    if (
      isFullyFenced &&
      (parsedFenceHeight === null ||
        !Number.isFinite(parsedFenceHeight) ||
        parsedFenceHeight <= 0)
    ) {
      Alert.alert(
        'Fence height required',
        'Enter the fence height in feet for a fully fenced property.'
      );
      return false;
    }

    return true;
  };

  const handleSaveDraft = async () => {
    if (!session?.user.id) {
      Alert.alert('Sign-in required', 'Sign in before creating a property.');
      return;
    }

    if (!hostAccess || !hostAccess.is_active || hostAccess.status === 'rejected') {
      Alert.alert(
        'Host profile required',
        'Complete your host profile before creating a property.'
      );
      return;
    }

    if (!validateForm()) {
      return;
    }

    const parsedAcreage = acreage.trim() ? Number(acreage) : null;
    const parsedFenceHeight = isFullyFenced ? Number(fenceHeightFeet) : null;

    try {
      setIsSaving(true);

      const { data, error } = await supabase
        .from('properties')
        .insert({
          host_id: session.user.id,
          name: name.trim(),
          short_description: shortDescription.trim(),
          site_address: siteAddress.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          postal_code: postalCode.trim(),
          price_per_hour: Number(pricePerHour),
          acreage: parsedAcreage,
          is_fully_fenced: isFullyFenced,
          fence_height_feet: parsedFenceHeight,
          instant_book: instantBook,
          is_published: false,
        })
        .select('id')
        .single();

      if (error) {
        Alert.alert('Unable to save property', error.message);
        return;
      }

      router.replace(`/property-draft/${data.id}` as never);
    } catch {
      Alert.alert('Something went wrong', 'We could not save your property. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator color="#263A24" size="large" />
          <Text style={styles.stateText}>Preparing your property setup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hostAccess) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.stateTitle}>Start with your host profile</Text>
          <Text style={styles.stateText}>
            We need your host profile before you can create a property.
          </Text>
          <Pressable onPress={() => router.replace('/host')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Become a Host</Text>
          </Pressable>
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
          <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
            <Text style={styles.backButtonText}>{'<'} Host Dashboard</Text>
          </Pressable>

          <Text style={styles.title}>Create a private space</Text>
          <Text style={styles.description}>
            Start with the essentials. You will add photos, arrival instructions, amenities, rules, and availability next.
          </Text>

          {hostAccess.status === 'pending' ? (
            <View style={styles.pendingNotice}>
              <Text style={styles.pendingTitle}>Host review in progress</Text>
              <Text style={styles.pendingText}>
                You can build your property draft now. It cannot be published to guest search until your host profile is approved.
              </Text>
            </View>
          ) : null}

          <View style={styles.formCard}>
            <Field label="Property name" value={name} onChangeText={setName} placeholder="Example: Maple Ridge Private Dog Field" />
            <Field
              label="Short description"
              value={shortDescription}
              onChangeText={setShortDescription}
              placeholder="Describe the space, privacy, and what makes it welcoming."
              multiline
            />
            <Field
              label="Site street address"
              value={siteAddress}
              onChangeText={setSiteAddress}
              placeholder="123 Country Lane"
              autoComplete="street-address"
            />
            <View style={styles.row}>
              <View style={styles.cityField}>
                <Field label="City" value={city} onChangeText={setCity} placeholder="City" />
              </View>
              <View style={styles.stateField}>
                <Field
                  label="State"
                  value={state}
                  onChangeText={setState}
                  placeholder="MI"
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
            </View>
            <Field
              label="ZIP or postal code"
              value={postalCode}
              onChangeText={setPostalCode}
              placeholder="ZIP or postal code"
              keyboardType="number-pad"
            />
            <View style={styles.row}>
              <View style={styles.priceField}>
                <Field
                  label="Price per hour"
                  value={pricePerHour}
                  onChangeText={setPricePerHour}
                  placeholder="15"
                  keyboardType="decimal-pad"
                  prefix="$"
                />
              </View>
              <View style={styles.acreageField}>
                <Field
                  label="Acreage (optional)"
                  value={acreage}
                  onChangeText={setAcreage}
                  placeholder="2.5"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.optionsCard}>
            <ToggleRow
              title="Fully fenced"
              description="Guests will see this as a key safety detail."
              value={isFullyFenced}
              onValueChange={setIsFullyFenced}
            />
            {isFullyFenced ? (
              <View style={styles.fenceField}>
                <Field
                  label="Fence height (feet)"
                  value={fenceHeightFeet}
                  onChangeText={setFenceHeightFeet}
                  placeholder="6"
                  keyboardType="decimal-pad"
                />
              </View>
            ) : null}
            <View style={styles.divider} />
            <ToggleRow
              title="Instant Book"
              description="Leave this off until you finish availability and booking settings."
              value={instantBook}
              onValueChange={setInstantBook}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={handleSaveDraft}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              isSaving && styles.buttonDisabled,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFDF8" />
            ) : (
              <Text style={styles.primaryButtonText}>Save Property Draft</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'street-address';
  maxLength?: number;
  prefix?: string;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  autoCapitalize = 'words',
  autoComplete,
  maxLength,
  prefix,
}: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrapper, multiline && styles.multilineWrapper]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8A877D"
          style={[styles.input, multiline && styles.multilineInput]}
          textAlignVertical={multiline ? 'top' : 'center'}
          value={value}
        />
      </View>
    </View>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        onValueChange={onValueChange}
        thumbColor="#FFFDF8"
        trackColor={{ false: '#B8B3A8', true: '#3D522C' }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateTitle: { color: colors.forest, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 12 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginBottom: 7 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', lineHeight: 36, marginBottom: 10 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 20 },
  pendingNotice: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 16, borderWidth: 1, marginBottom: 18, padding: 16 },
  pendingTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', marginBottom: 5 },
  pendingText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  formCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, padding: 18 },
  fieldGroup: { marginBottom: 17 },
  label: { color: colors.forest, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  inputWrapper: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', minHeight: 54 },
  multilineWrapper: { alignItems: 'flex-start', minHeight: 108 },
  input: { color: colors.forest, flex: 1, fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  multilineInput: { minHeight: 106, paddingTop: 14 },
  prefix: { color: colors.forest, fontSize: 16, fontWeight: '800', paddingLeft: 15 },
  row: { flexDirection: 'row', gap: 12 },
  cityField: { flex: 1 },
  stateField: { width: 80 },
  priceField: { flex: 1 },
  acreageField: { flex: 1 },
  optionsCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 18 },
  toggleRow: { alignItems: 'center', flexDirection: 'row' },
  toggleText: { flex: 1, paddingRight: 14 },
  toggleTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', marginBottom: 5 },
  toggleDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  divider: { backgroundColor: '#CBD1BD', height: 1, marginVertical: 18 },
  fenceField: { marginTop: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 26, minHeight: 56, paddingHorizontal: 20 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.65 },
});
