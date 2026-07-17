import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { GuestProfile } from '../../types/guest-profile';

type ProfileForm = Omit<
  GuestProfile,
  'user_id' | 'profile_completed_at' | 'created_at' | 'updated_at' | 'profile_image_path'
>;

const emptyProfile: ProfileForm = {
  full_name: '',
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

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export default function GuestProfileScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { isMember, session } = useAuth();
  const backDestination =
    typeof returnTo === 'string' && returnTo.startsWith('/')
      ? returnTo
      : '/dashboard';
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);

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
        setProfile({
          full_name: savedProfile.full_name,
          email: savedProfile.email,
          phone: formatPhoneNumber(savedProfile.phone),
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
        setProfile(emptyProfile);
        setIsComplete(false);
        setProfileImageUri(null);
      }

      setIsLoading(false);
    };

    void loadProfile();
  }, [isMember, session?.user.id, session?.user.email, session?.user.user_metadata]);

  const updateProfile = <Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key]
  ) => {
    setStatusMessage('');
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const pickProfileImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setProfileImageUri(result.assets[0].uri);
  };

  const saveProfile = async () => {
    if (!session?.user.id) {
      return;
    }

    const requiredValues = [
      profile.full_name,
      profile.email,
      profile.phone,
      profile.address_line1,
      profile.city,
      profile.state,
      profile.postal_code,
    ];

    if (requiredValues.some((value) => !value.trim()) || profile.dog_count < 1) {
      setStatusMessage('Complete every required field before saving your reservation profile.');
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
          full_name: profile.full_name.trim(),
          email: profile.email.trim().toLowerCase(),
          phone: profile.phone.trim(),
          address_line1: profile.address_line1.trim(),
          address_line2: profile.address_line2.trim(),
          city: profile.city.trim(),
          state: profile.state.trim().toUpperCase(),
          postal_code: profile.postal_code.trim(),
          dog_count: profile.dog_count,
          dog_details: profile.dog_details.trim(),
          ...(profileImagePath ? { profile_image_path: profileImagePath } : {}),
          profile_completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        throw error;
      }

      setIsComplete(true);
      setStatusMessage('');
      if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
        router.replace(returnTo as never);
      }
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

      await supabase.auth.signOut();
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

  const confirmProfileDeletion = () => {
    Alert.alert(
      'Delete your profile?',
      'This permanently removes your private guest profile from K9 Country. This cannot be undone. You will be signed out and must complete a new profile before making another reservation.',
      [
        { text: 'Keep My Profile', style: 'cancel' },
        {
          text: 'Delete My Profile',
          style: 'destructive',
          onPress: () => void deleteProfile(),
        },
      ]
    );
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
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.replace(backDestination as never)} style={styles.backButton}>
            <Text style={styles.backButtonText}>
              {returnTo ? '← Back to reservation' : '← Member Dashboard'}
            </Text>
          </Pressable>

          <View style={styles.profileHeader}>
            <View style={styles.profileHeaderCopy}>
              <Text style={styles.title}>My Profile</Text>
              <Text style={styles.description}>Complete this once before your first reservation. It helps K9 Country keep reservations accurate and safe.</Text>
            </View>
            <Pressable accessibilityLabel="Choose profile photo" accessibilityRole="button" onPress={() => void pickProfileImage()} style={styles.profilePhotoControl}>
              <View style={styles.profilePhotoButton}>
                <Image source={profileImageUri ? { uri: profileImageUri } : require('../../assets/images/k9-11.png')} style={styles.profilePhoto} />
              </View>
              <Text style={styles.profilePhotoText}>Add photo</Text>
            </Pressable>
          </View>

          <View style={[styles.completionCard, isComplete && styles.completionCardComplete]}>
            <Text style={styles.completionTitle}>{isComplete ? 'Profile ready for reservations' : 'Required before your first reservation'}</Text>
            <Text style={styles.completionText}>
              Your address, phone number, and email are private to you. Hosts cannot view them or use them to locate you.
            </Text>
          </View>

          <ProfileSection title="Member information">
            <Field label="Full legal name" required value={profile.full_name} onChangeText={(value) => updateProfile('full_name', value)} autoComplete="name" autoCapitalize="words" />
            <Field label="Email address" required value={profile.email} onChangeText={(value) => updateProfile('email', value)} autoComplete="email" autoCapitalize="none" keyboardType="email-address" />
            <Field label="Phone number" required value={profile.phone} onChangeText={(value) => updateProfile('phone', formatPhoneNumber(value))} autoComplete="tel" keyboardType="phone-pad" maxLength={12} />
          </ProfileSection>

          <ProfileSection title="Private home address">
            <Text style={styles.privateNote}>Used only for your private reservation record. It is never shared with a host.</Text>
            <Field label="Street address" required value={profile.address_line1} onChangeText={(value) => updateProfile('address_line1', value)} autoComplete="street-address" autoCapitalize="words" />
            <Field label="Apartment, suite, or unit" value={profile.address_line2} onChangeText={(value) => updateProfile('address_line2', value)} autoCapitalize="words" />
            <View style={styles.row}>
              <View style={styles.cityField}><Field label="City" required value={profile.city} onChangeText={(value) => updateProfile('city', value)} autoCapitalize="words" /></View>
              <View style={styles.stateField}><Field label="State" required value={profile.state} onChangeText={(value) => updateProfile('state', value)} autoCapitalize="characters" maxLength={2} /></View>
            </View>
            <Field label="ZIP code" required value={profile.postal_code} onChangeText={(value) => updateProfile('postal_code', value)} autoComplete="postal-code" keyboardType="number-pad" />
          </ProfileSection>

          <ProfileSection title="Your dogs">
            <Text style={styles.privateNote}>The number saved here is used as the default when you start a booking. You can change it for a specific visit.</Text>
            <Text style={styles.label}>How many dogs are in your household? <Text style={styles.required}>Required</Text></Text>
            <View style={styles.dogCountRow}>
              <Pressable accessibilityLabel="Remove one dog" disabled={profile.dog_count <= 1} onPress={() => updateProfile('dog_count', Math.max(1, profile.dog_count - 1))} style={[styles.countButton, profile.dog_count <= 1 && styles.countButtonDisabled]}><Text style={styles.countButtonText}>−</Text></Pressable>
              <Text style={styles.dogCountText}>{profile.dog_count}</Text>
              <Pressable accessibilityLabel="Add one dog" disabled={profile.dog_count >= 20} onPress={() => updateProfile('dog_count', Math.min(20, profile.dog_count + 1))} style={styles.countButton}><Text style={styles.countButtonText}>+</Text></Pressable>
            </View>
            <Field label="Dog names and important notes" value={profile.dog_details} onChangeText={(value) => updateProfile('dog_details', value)} placeholder="Optional: for example, Scout and Maple; both friendly with adults." multiline />
          </ProfileSection>

          <View style={styles.messagingCard}>
            <Text style={styles.messagingTitle}>Communication stays in K9 Country</Text>
            <Text style={styles.messagingText}>Questions and reservation communication happen only through Messages. Your personal contact information is not shown to hosts.</Text>
          </View>

          {statusMessage ? <View style={styles.statusBanner}><Text style={styles.statusMessage}>{statusMessage}</Text></View> : null}

          <Pressable disabled={isSaving} onPress={saveProfile} style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}>
            {isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Save Private Profile</Text>}
          </Pressable>

          {isComplete ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/search' as never)} style={styles.beginSearchButton}>
              <Text style={styles.beginSearchButtonText}>Begin Your Search</Text>
            </Pressable>
          ) : null}

          <View style={styles.deleteSection}>
            <Text style={styles.deleteTitle}>Delete My Profile</Text>
            <Text style={styles.deleteText}>
              Permanently remove the private profile stored for this guest. This cannot be undone.
            </Text>
            <Pressable disabled={isDeleting} onPress={confirmProfileDeletion} style={[styles.deleteButton, isDeleting && styles.primaryButtonDisabled]}>
              {isDeleting ? <ActivityIndicator color={colors.red} /> : <Text style={styles.deleteButtonText}>Delete My Profile</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
};

function Field({ label, required, multiline, ...inputProps }: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> Required</Text> : null}</Text>
      <TextInput {...inputProps} multiline={multiline} placeholderTextColor="#8A877D" style={[styles.input, multiline && styles.multilineInput]} textAlignVertical={multiline ? 'top' : 'center'} />
    </View>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 42 },
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
  profilePhotoText: { color: colors.brown, fontSize: 12, fontWeight: '900', marginTop: 6, textAlign: 'center' },
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
  multilineInput: { minHeight: 100, paddingTop: 13, paddingBottom: 13 },
  row: { flexDirection: 'row', gap: 12 },
  cityField: { flex: 1 },
  stateField: { width: 84 },
  dogCountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 17 },
  countButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  countButtonDisabled: { opacity: 0.4 },
  countButtonText: { color: colors.warmWhite, fontSize: 26, fontWeight: '800', lineHeight: 29 },
  dogCountText: { width: 58, color: colors.forest, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  messagingCard: { paddingVertical: 3, marginTop: 3, marginBottom: 18 },
  messagingTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginBottom: 6 },
  messagingText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  statusBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 13, borderWidth: 1, marginBottom: 14, padding: 13 },
  statusMessage: { color: colors.red, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  primaryButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.brown, paddingHorizontal: 22 },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  beginSearchButton: { alignItems: 'center', backgroundColor: colors.forest, borderColor: colors.forest, borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 56, paddingHorizontal: 22 },
  beginSearchButtonText: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  deleteSection: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 18 },
  deleteTitle: { color: colors.red, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  deleteText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 15 },
  deleteButton: { alignItems: 'center', borderColor: colors.red, borderRadius: 13, borderWidth: 1, justifyContent: 'center', minHeight: 52 },
  deleteButtonText: { color: colors.red, fontSize: 15, fontWeight: '900' },
});
