import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { formatUsPhoneNumber, hasValidUsPhoneNumber, phoneNumberHelpText } from '../../lib/phone-number';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { GuestProfile } from '../../types/guest-profile';

type ProfileForm = Omit<
  GuestProfile,
  'user_id' | 'full_name' | 'profile_completed_at' | 'created_at' | 'updated_at' | 'profile_image_path'
>;

type ProfileFieldName = keyof ProfileForm;
type DogSummary = { id: string; name: string };

const emptyProfile: ProfileForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  dog_count: 1,
  dog_details: '',
};

function splitFullName(fullName: string) {
  const [firstName = '', ...lastNameParts] = fullName.trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(' ') };
}

function normalizeNameParts(firstName: string, lastName: string, fullName: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first && last && first === last) {
    return splitFullName(first);
  }
  if (first || last) {
    return { firstName: first, lastName: last };
  }
  return splitFullName(fullName);
}

export default function GuestProfileScreen() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { isMember, session } = useAuth();
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteWarningOpen, setIsDeleteWarningOpen] = useState(false);
  const [isDogProfileRequiredOpen, setIsDogProfileRequiredOpen] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldName, string>>>({});
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [dogProfiles, setDogProfiles] = useState<DogSummary[]>([]);
  const isOnboarding = onboarding === 'true' && !isComplete;

  useEffect(() => {
    const loadProfile = async () => {
      if (!isMember || !session?.user.id) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('guest_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        setStatusMessage('We could not load your private profile. Please try again.');
        setIsLoading(false);
        return;
      }

      if (data) {
        const savedProfile = data as GuestProfile;
        const metadataFirstName = typeof session.user.user_metadata?.first_name === 'string'
          ? session.user.user_metadata.first_name
          : '';
        const metadataLastName = typeof session.user.user_metadata?.last_name === 'string'
          ? session.user.user_metadata.last_name
          : '';
        const savedNameParts = normalizeNameParts(
          savedProfile.first_name || metadataFirstName,
          savedProfile.last_name || metadataLastName,
          savedProfile.full_name
        );
        setProfile({
          first_name: savedNameParts.firstName,
          last_name: savedNameParts.lastName,
          email: savedProfile.email || session.user.email || '',
          phone: formatUsPhoneNumber(savedProfile.phone),
          address_line1: savedProfile.address_line1,
          address_line2: savedProfile.address_line2,
          city: savedProfile.city,
          state: savedProfile.state,
          postal_code: savedProfile.postal_code,
          dog_count: savedProfile.dog_count,
          dog_details: savedProfile.dog_details,
        });
        setIsComplete(Boolean(savedProfile.profile_completed_at));
        if (savedProfile.profile_image_path) setProfileImageUri(supabase.storage.from('guest-profile-images').getPublicUrl(savedProfile.profile_image_path).data.publicUrl);
      } else {
        const metadataNameParts = normalizeNameParts(
          typeof session.user.user_metadata?.first_name === 'string' ? session.user.user_metadata.first_name : '',
          typeof session.user.user_metadata?.last_name === 'string' ? session.user.user_metadata.last_name : '',
          typeof session.user.user_metadata?.full_name === 'string' ? session.user.user_metadata.full_name : ''
        );
        setProfile({
          ...emptyProfile,
          first_name: metadataNameParts.firstName,
          last_name: metadataNameParts.lastName,
          email: session.user.email ?? '',
        });
        setIsComplete(false);
        setProfileImageUri(null);
      }

      const { data: savedDogs, error: savedDogsError } = await supabase
        .from('dog_profiles')
        .select('id, name')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      if (savedDogsError) setStatusMessage('We could not load your dog profiles. Please try again.');
      else setDogProfiles((savedDogs ?? []) as DogSummary[]);

      setIsLoading(false);
    };

    void loadProfile();
  }, [isMember, session?.user.id, session?.user.email, session?.user.user_metadata]);

  const updateProfile = <Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key]
  ) => {
    setStatusMessage('');
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const pickProfileImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setProfileImageUri(result.assets[0].uri);
  };

  const saveParentProfileDraftAndOpenDogs = async () => {
    if (!session?.user.id) return;

    try {
      setIsSaving(true);
      const { error } = await supabase.from('guest_profiles').upsert(
        {
          user_id: session.user.id,
          full_name: `${profile.first_name.trim()} ${profile.last_name.trim()}`.trim(),
          first_name: profile.first_name.trim(),
          last_name: profile.last_name.trim(),
          email: profile.email.trim().toLowerCase(),
          phone: profile.phone.trim(),
          address_line1: profile.address_line1.trim(),
          address_line2: profile.address_line2.trim(),
          city: profile.city.trim(),
          state: profile.state.trim().toUpperCase(),
          postal_code: profile.postal_code.trim(),
          dog_count: 0,
          dog_details: profile.dog_details.trim(),
          profile_completed_at: null,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;
      setIsDogProfileRequiredOpen(false);
      router.push('/dog-profiles?returnTo=parent' as never);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'We could not save your Parent Profile draft. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!session?.user.id) {
      return;
    }

    const validationErrors: Partial<Record<ProfileFieldName, string>> = {};
    if (!profile.first_name.trim()) validationErrors.first_name = 'Enter your first name.';
    if (!profile.last_name.trim()) validationErrors.last_name = 'Enter your last name.';
    if (!profile.email.trim()) validationErrors.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(profile.email.trim())) validationErrors.email = 'Enter a valid email address.';
    if (!profile.phone.trim()) validationErrors.phone = 'Enter a phone number.';
    else if (!hasValidUsPhoneNumber(profile.phone)) validationErrors.phone = phoneNumberHelpText;
    if (!profile.address_line1.trim()) validationErrors.address_line1 = 'Enter your street address.';
    if (!profile.city.trim()) validationErrors.city = 'Enter your city.';
    if (!profile.state.trim()) validationErrors.state = 'Enter your state.';
    if (!profile.postal_code.trim()) validationErrors.postal_code = 'Enter your ZIP code.';

    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setStatusMessage('Please review the highlighted fields before saving your profile.');
      return;
    }

    if (dogProfiles.length === 0) {
      setIsDogProfileRequiredOpen(true);
      return;
    }

    try {
      setIsSaving(true);
      setStatusMessage('');

      let profileImagePath: string | null = null;
      if (profileImageUri) {
        profileImagePath = `${session.user.id}/profile.jpg`;
        const response = await fetch(profileImageUri);
        const { error: uploadError } = await supabase.storage.from('guest-profile-images').upload(profileImagePath, await response.arrayBuffer(), { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw uploadError;
      }

      const { error } = await supabase.from('guest_profiles').upsert(
        {
          user_id: session.user.id,
          full_name: `${profile.first_name.trim()} ${profile.last_name.trim()}`.trim(),
          first_name: profile.first_name.trim(),
          last_name: profile.last_name.trim(),
          email: profile.email.trim().toLowerCase(),
          phone: profile.phone.trim(),
          address_line1: profile.address_line1.trim(),
          address_line2: profile.address_line2.trim(),
          city: profile.city.trim(),
          state: profile.state.trim().toUpperCase(),
          postal_code: profile.postal_code.trim(),
          dog_count: Math.max(1, dogProfiles.length),
          dog_details: profile.dog_details.trim(),
          ...(profileImagePath ? { profile_image_path: profileImagePath } : {}),
          profile_completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        throw error;
      }

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          full_name: `${profile.first_name.trim()} ${profile.last_name.trim()}`.trim(),
          first_name: profile.first_name.trim(),
          last_name: profile.last_name.trim(),
        },
      });

      if (authUpdateError) {
        throw authUpdateError;
      }

      setIsComplete(true);
      setStatusMessage('');
      router.replace('/dashboard?profileSaved=true' as never);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'We could not save your profile. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!session?.user.id) {
      return;
    }

    try {
      setIsDeleting(true);
      setStatusMessage('');

      const { data, error } = await supabase
        .from('guest_profiles')
        .delete()
        .eq('user_id', session.user.id)
        .select('user_id');

      if (error) {
        throw error;
      }
      if (!data?.length) {
        throw new Error('Your profile could not be found, so nothing was deleted. Please try again.');
      }

      // Storage objects must be deleted through the Storage API, not a
      // database trigger. A missing image is harmless, so it never blocks
      // deletion of the private profile.
      await supabase.storage
        .from('guest-profile-images')
        .remove([`${session.user.id}/profile.jpg`]);

      await supabase.auth.signOut();
      router.dismissAll();
      router.replace('/');
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'We could not delete your profile. Please try again.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isMember) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.title}>Your guest profile</Text>
          <Text style={styles.description}>
            Sign in as a member to keep your reservation details private and ready for booking.
          </Text>
          <Pressable onPress={() => router.push('/sign-in?intent=guest' as never)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Member Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.forest} size="large" />
          <Text style={styles.loadingText}>Loading your private profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
          <View style={styles.profileHeader}>
            <View style={styles.profileHeaderCopy}>
              <Text style={styles.title}>Parent Profile</Text>
              <Text style={styles.description}>{isOnboarding ? 'Complete your profile to continue to private spaces.' : 'Keep your reservation details accurate and safe.'}</Text>
            </View>
            <Pressable accessibilityLabel="Choose profile photo" accessibilityRole="button" onPress={() => void pickProfileImage()} style={styles.profilePhotoControl}>
              <View style={styles.profilePhotoButton}>
                <Image source={profileImageUri ? { uri: profileImageUri } : require('../../assets/images/k9-11.png')} style={styles.profilePhoto} />
              </View>
            </Pressable>
          </View>

          <View style={[styles.completionCard, isComplete && styles.completionCardComplete]}>
            <Text style={styles.completionTitle}>{isComplete ? 'Profile ready for reservations' : 'Required before your first reservation'}</Text>
            <Text style={styles.completionText}>
              Your address, phone number, and email are private to you. Hosts cannot view them or use them to locate you.
            </Text>
          </View>

          <ProfileSection title="Member information">
            <View style={styles.row}>
              <View style={styles.nameField}><Field label="First name" required error={fieldErrors.first_name} value={profile.first_name} onChangeText={(value) => updateProfile('first_name', value)} autoComplete="name" autoCapitalize="words" /></View>
              <View style={styles.nameField}><Field label="Last name" required error={fieldErrors.last_name} value={profile.last_name} onChangeText={(value) => updateProfile('last_name', value)} autoComplete="name" autoCapitalize="words" /></View>
            </View>
            <Field label="Email address" required error={fieldErrors.email} value={profile.email} onChangeText={(value) => updateProfile('email', value)} autoComplete="email" autoCapitalize="none" keyboardType="email-address" />
            <Field label="Phone number" required error={fieldErrors.phone} value={profile.phone} onChangeText={(value) => updateProfile('phone', formatUsPhoneNumber(value))} autoComplete="tel" keyboardType="phone-pad" maxLength={12} placeholder="248-555-1234" />
          </ProfileSection>

          <ProfileSection title="Private home address">
            <Text style={styles.privateNote}>Used only for your private reservation record. It is never shared with a host.</Text>
            <Field label="Street address" required error={fieldErrors.address_line1} value={profile.address_line1} onChangeText={(value) => updateProfile('address_line1', value)} autoComplete="street-address" autoCapitalize="words" />
            <Field label="Apartment, suite, or unit" value={profile.address_line2} onChangeText={(value) => updateProfile('address_line2', value)} autoCapitalize="words" />
            <View style={styles.row}>
              <View style={styles.cityField}><Field label="City" required error={fieldErrors.city} value={profile.city} onChangeText={(value) => updateProfile('city', value)} autoCapitalize="words" /></View>
              <View style={styles.stateField}><Field label="State" required error={fieldErrors.state} value={profile.state} onChangeText={(value) => updateProfile('state', value)} autoCapitalize="characters" maxLength={2} /></View>
            </View>
            <Field label="ZIP code" required error={fieldErrors.postal_code} value={profile.postal_code} onChangeText={(value) => updateProfile('postal_code', value)} autoComplete="postal-code" keyboardType="number-pad" />
          </ProfileSection>

          <ProfileSection title="Your dogs">
            <Text style={styles.privateNote}>Your saved dog profiles appear here. Add and update their information from Dog Profiles.</Text>
            {dogProfiles.length ? <View style={styles.dogList}>{dogProfiles.map((dog, index) => <View key={dog.id} style={styles.dogRow}><Text style={styles.dogNumber}>{index + 1}</Text><Text style={styles.dogName}>{dog.name}</Text></View>)}</View> : <Text style={styles.noDogsText}>No dog profiles yet. Complete your first dog’s profile to add it here.</Text>}
            <Pressable accessibilityRole="button" onPress={() => router.push('/dog-profiles?returnTo=parent' as never)} style={styles.manageDogsButton}><Text style={styles.manageDogsButtonText}>Manage Dog Profiles</Text></Pressable>
          </ProfileSection>

          <View style={styles.messagingCard}>
            <Text style={styles.messagingTitle}>Communication stays in K9 Country</Text>
            <Text style={styles.messagingText}>Questions and reservation communication happen only through Messages. Your personal contact information is not shown to hosts.</Text>
          </View>

          {statusMessage ? <View style={styles.statusBanner}><Text style={styles.statusMessage}>{statusMessage}</Text></View> : null}

          <Pressable disabled={isSaving} onPress={saveProfile} style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}>
            {isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Save Parent Profile</Text>}
          </Pressable>

          <View style={styles.deleteSection}>
            <Text style={styles.deleteTitle}>Delete My Profile</Text>
            <Text style={styles.deleteText}>
              Permanently remove the private profile stored for this guest. This cannot be undone.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={() => setIsDeleteWarningOpen(true)}
              style={[styles.deleteButton, isDeleting && styles.primaryButtonDisabled]}
            >
              {isDeleting ? <ActivityIndicator color={colors.red} /> : <Text style={styles.deleteButtonText}>Delete My Profile</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal animationType="fade" onRequestClose={() => setIsDeleteWarningOpen(false)} transparent visible={isDeleteWarningOpen}>
        <View style={styles.deleteWarningBackdrop}>
          <View accessibilityRole="alert" style={styles.deleteWarningModal}>
            <Text style={styles.deleteWarningTitle}>Delete your profile?</Text>
            <Text style={styles.deleteWarningText}>This permanently removes your private member profile, including your contact details, address, dog information, and profile photo. This cannot be undone.</Text>
            <Text style={styles.deleteWarningText}>Your reservation history may still be retained where required for records and safety.</Text>
            <Pressable accessibilityRole="button" disabled={isDeleting} onPress={() => void deleteProfile()} style={[styles.confirmDeleteButton, isDeleting && styles.primaryButtonDisabled]}>
              {isDeleting ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.confirmDeleteButtonText}>Yes, Delete My Profile</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isDeleting} onPress={() => setIsDeleteWarningOpen(false)} style={styles.cancelDeleteButton}>
              <Text style={styles.cancelDeleteButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setIsDogProfileRequiredOpen(false)} transparent visible={isDogProfileRequiredOpen}>
        <View style={styles.deleteWarningBackdrop}>
          <View accessibilityRole="alert" style={styles.deleteWarningModal}>
            <Text style={styles.dogProfileRequiredTitle}>Complete your dog’s profile</Text>
            <Text style={styles.deleteWarningText}>Before you can save your Parent Profile and reserve a private space, add at least one dog profile.</Text>
            <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void saveParentProfileDraftAndOpenDogs()} style={[styles.manageDogProfileButton, isSaving && styles.primaryButtonDisabled]}>
              {isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.confirmDeleteButtonText}>Manage Dog Profiles</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: 'name' | 'email' | 'tel' | 'street-address' | 'postal-code';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  maxLength?: number;
  multiline?: boolean;
  error?: string;
};

function Field({ label, required, multiline, error, ...inputProps }: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> Required</Text> : null}</Text>
      <TextInput {...inputProps} multiline={multiline} placeholderTextColor="#8A877D" style={[styles.input, multiline && styles.multilineInput, error && styles.inputError]} textAlignVertical={multiline ? 'top' : 'center'} />
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 42 },
  centeredState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 26 },
  loadingText: { color: colors.muted, fontSize: 15, marginTop: 14 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 12 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginBottom: 7 },
  title: { color: colors.forest, fontSize: 31, fontWeight: '900', marginBottom: 10 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 19 },
  profileHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 14 },
  profileHeaderCopy: { flex: 1 },
  profilePhotoControl: { alignItems: 'center', width: 88 },
  profilePhotoButton: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: colors.brown, borderRadius: 44, borderWidth: 1, height: 88, justifyContent: 'center', overflow: 'hidden', width: 88 },
  profilePhoto: { height: '100%', width: '100%' },
  completionCard: { backgroundColor: '#FFF5E8', borderWidth: 1, borderColor: '#E7C79D', borderRadius: 18, padding: 17, marginBottom: 18 },
  completionCardComplete: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6' },
  completionTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginBottom: 6 },
  completionText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  section: { backgroundColor: colors.warmWhite, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 18, marginBottom: 16 },
  sectionTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 15 },
  privateNote: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: -7, marginBottom: 15 },
  fieldGroup: { marginBottom: 15 },
  label: { color: colors.forest, fontSize: 14, fontWeight: '800', marginBottom: 7 },
  required: { color: colors.brown, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.cream, color: colors.forest, fontSize: 16, paddingHorizontal: 14 },
  inputError: { borderColor: colors.red, borderWidth: 2 },
  multilineInput: { minHeight: 100, paddingTop: 13, paddingBottom: 13 },
  fieldErrorText: { color: colors.red, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 5 },
  row: { flexDirection: 'row', gap: 12 },
  nameField: { flex: 1 },
  cityField: { flex: 1 },
  stateField: { width: 106 },
  dogList: { gap: 9 },
  dogRow: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 12 },
  dogNumber: { backgroundColor: colors.forest, borderRadius: 14, color: colors.warmWhite, fontSize: 13, fontWeight: '900', height: 28, lineHeight: 28, marginRight: 10, textAlign: 'center', width: 28 },
  dogName: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  noDogsText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  manageDogsButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 15, minHeight: 50 },
  manageDogsButtonText: { color: colors.brown, fontSize: 15, fontWeight: '900' },
  messagingCard: { paddingVertical: 3, marginTop: 3, marginBottom: 18 },
  messagingTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginBottom: 6 },
  messagingText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  statusBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 13, borderWidth: 1, marginBottom: 14, padding: 13 },
  statusMessage: { color: colors.red, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  primaryButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.brown, paddingHorizontal: 22 },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  deleteSection: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 18 },
  deleteTitle: { color: colors.red, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  deleteText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 15 },
  deleteButton: { alignItems: 'center', borderColor: colors.red, borderRadius: 13, borderWidth: 1, justifyContent: 'center', minHeight: 52 },
  deleteButtonText: { color: colors.red, fontSize: 15, fontWeight: '900' },
  deleteWarningBackdrop: { alignItems: 'center', backgroundColor: 'rgba(20, 38, 24, 0.58)', flex: 1, justifyContent: 'center', padding: 24 },
  deleteWarningModal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 430, padding: 24, width: '100%' },
  deleteWarningTitle: { color: colors.red, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  dogProfileRequiredTitle: { color: colors.forest, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  deleteWarningText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: 'center' },
  confirmDeleteButton: { alignItems: 'center', backgroundColor: colors.red, borderRadius: 13, justifyContent: 'center', marginTop: 22, minHeight: 52 },
  manageDogProfileButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 13, justifyContent: 'center', marginTop: 22, minHeight: 52 },
  confirmDeleteButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  cancelDeleteButton: { alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 },
  cancelDeleteButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
});
