import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { HostPageGuide } from '../../components/host-page-guide';
import { dogBreeds } from '../../constants/dog-breeds';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type DogProfile = { id: string; name: string; breed: string; age: string; size: string; temperament: string; behavior_traits: string[]; notes: string; photo_path: string | null; photo_url: string | null };
type DogForm = Omit<DogProfile, 'id' | 'photo_path' | 'photo_url'>;
type DogFieldName = 'name' | 'breed' | 'age' | 'size' | 'behavior_traits';

const emptyDog: DogForm = { name: '', breed: '', age: '', size: '', temperament: '', behavior_traits: [], notes: '' };
const sizeOptions = ['Small', 'Medium', 'Large', 'Extra large'];
const ageOptions = Array.from({ length: 30 }, (_, index) => String(index + 1));
const behaviorOptions = ['Affectionate', 'Alert', 'Anxious', 'Calm', 'Cautious', 'Confident', 'Curious', 'Dog-selective', 'Easily overstimulated', 'Energetic', 'Excitable', 'Friendly', 'In training', 'Independent', 'Laid-back', 'Needs a private, dog-free space', 'People-selective', 'Playful', 'Prefers quiet spaces', 'Protective', 'Reactive around dogs', 'Reactive around people', 'Reserved', 'Sensitive', 'Shy', 'Timid', 'Vocal'];

export default function DogProfilesScreen() {
  const { dogCount, onboarding, returnTo } = useLocalSearchParams<{ dogCount?: string; onboarding?: string; returnTo?: string }>();
  const { session } = useAuth();
  const [dogs, setDogs] = useState<DogProfile[]>([]);
  const [form, setForm] = useState<DogForm>(emptyDog);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBreedPickerOpen, setIsBreedPickerOpen] = useState(false);
  const [isAgePickerOpen, setIsAgePickerOpen] = useState(false);
  const [isBehaviorPickerOpen, setIsBehaviorPickerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [breedSearch, setBreedSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DogFieldName, string>>>({});
  const matchingBreeds = dogBreeds.filter((breed) => breed.toLowerCase().includes(breedSearch.trim().toLowerCase()));
  const requestedDogCount = Math.max(1, Number(dogCount) || 1);
  const isOnboarding = onboarding === 'true' && dogs.length === 0;

  const loadDogs = useCallback(async () => {
    if (!session?.user.id) {
      setDogs([]);
      setIsLoading(false);
      return [] as DogProfile[];
    }
    const { data, error } = await supabase.from('dog_profiles').select('id, name, breed, age, size, temperament, behavior_traits, notes, photo_path').eq('user_id', session.user.id).order('created_at', { ascending: true });
    if (error) {
      setStatusMessage('We could not load your dog profiles. Please try again.');
      setIsLoading(false);
      return [] as DogProfile[];
    }
    const loadedDogs = await Promise.all((data ?? []).map(async (dog) => {
      const { data: signedPhoto } = dog.photo_path
        ? await supabase.storage.from('dog-profile-images').createSignedUrl(dog.photo_path, 60 * 60)
        : { data: null };
      return { ...dog, behavior_traits: Array.isArray(dog.behavior_traits) ? dog.behavior_traits : [], photo_url: signedPhoto?.signedUrl ?? null };
    })) as DogProfile[];
    setDogs(loadedDogs);
    setIsLoading(false);
    return loadedDogs;
  }, [session?.user.id]);

  useEffect(() => { void loadDogs(); }, [loadDogs]);

  useEffect(() => {
    if (!isLoading && isOnboarding) setIsFormOpen(true);
  }, [isLoading, isOnboarding]);

  const updateForm = <Key extends keyof DogForm>(key: Key, value: DogForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setStatusMessage('');
    setFieldErrors((current) => {
      if (!current[key as DogFieldName]) return current;
      const next = { ...current };
      delete next[key as DogFieldName];
      return next;
    });
  };

  const resetForm = () => {
    setForm(emptyDog);
    setEditingId(null);
    setFieldErrors({});
    setSelectedPhoto(null);
    setIsFormOpen(false);
  };

  const pickDogPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatusMessage('Photo library permission is needed to add a dog photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) {
      setSelectedPhoto(result.assets[0]);
      setStatusMessage('');
    }
  };

  const uploadDogPhoto = async (dogId: string, asset: ImagePicker.ImagePickerAsset) => {
    if (!session?.user.id) return;
    const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const contentType = supportedMimeTypes.includes(asset.mimeType ?? '') ? asset.mimeType! : 'image/jpeg';
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const photoPath = `${session.user.id}/${dogId}.${extension}`;
    const existingPhotoPath = dogs.find((dog) => dog.id === dogId)?.photo_path;
    const response = await fetch(asset.uri);
    const { error: uploadError } = await supabase.storage.from('dog-profile-images').upload(photoPath, await response.arrayBuffer(), { contentType, upsert: true });
    if (uploadError) throw uploadError;
    const { error: profileError } = await supabase.from('dog_profiles').update({ photo_path: photoPath }).eq('id', dogId).eq('user_id', session.user.id);
    if (profileError) throw profileError;
    if (existingPhotoPath && existingPhotoPath !== photoPath) await supabase.storage.from('dog-profile-images').remove([existingPhotoPath]);
  };

  const synchronizeDogCount = async (dogCount: number) => {
    if (!session?.user.id) return;
    const { error } = await supabase
      .from('guest_profiles')
      .update({ dog_count: Math.max(1, dogCount) })
      .eq('user_id', session.user.id);
    if (error) console.error('Unable to synchronize saved dog count:', error.message);
  };

  const saveDog = async () => {
    if (!session?.user.id) return;
    const name = form.name.trim();
    const validationErrors: Partial<Record<DogFieldName, string>> = {};
    if (!name) validationErrors.name = 'Enter your dog’s name.';
    if (!form.breed.trim()) validationErrors.breed = 'Select a breed or mix.';
    if (!form.age.trim()) validationErrors.age = 'Select an age.';
    if (!form.size) validationErrors.size = 'Select a size.';
    if (form.behavior_traits.length === 0) validationErrors.behavior_traits = 'Select at least one behavior or social comfort trait.';
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setStatusMessage('Please complete the required dog profile fields before saving.');
      return;
    }
    const dogRecord = { user_id: session.user.id, name, breed: form.breed.trim(), age: form.age.trim(), size: form.size, temperament: form.temperament.trim(), behavior_traits: form.behavior_traits, notes: form.notes.trim() };
    try {
      setIsSaving(true);
      setStatusMessage('');
      const { data: savedDog, error } = editingId
        ? await supabase.from('dog_profiles').update(dogRecord).eq('id', editingId).eq('user_id', session.user.id).select('id').single()
        : await supabase.from('dog_profiles').insert(dogRecord).select('id').single();
      if (error) throw error;
      if (!savedDog) throw new Error('We could not find the saved dog profile. Please try again.');
      // A photo is optional. Keep a successful profile save successful even if the
      // device or storage service cannot finish the separate image upload.
      let photoUploadMessage = '';
      if (selectedPhoto) {
        try {
          await uploadDogPhoto(savedDog.id, selectedPhoto);
        } catch (photoError) {
          console.error('Unable to upload dog photo:', photoError);
          photoUploadMessage = 'Your dog profile was saved, but the photo could not be uploaded. You can add it later by editing this profile.';
        }
      }
      const savedDogs = await loadDogs();
      await synchronizeDogCount(savedDogs.length);
      resetForm();
      if (returnTo === 'parent' && savedDogs.length > 0) {
        Alert.alert(
          'Dog profile saved',
          photoUploadMessage || 'Return to Parent Profile to finish saving your member information.',
          [{ text: 'Return to Parent Profile', onPress: () => router.replace('/profile?onboarding=true') }]
        );
      } else if (isOnboarding && savedDogs.length > 0) {
        Alert.alert(
          'Dog profile saved',
          photoUploadMessage || 'Your member setup is complete. You can now search for private spaces and make a reservation.',
          [{ text: 'Go to Member Dashboard', onPress: () => router.replace('/dashboard') }]
        );
      } else if (photoUploadMessage) {
        setStatusMessage(photoUploadMessage);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'We could not save this dog profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (dog: DogProfile) => {
    setEditingId(dog.id);
    setForm({ name: dog.name, breed: dog.breed, age: dog.age, size: dog.size, temperament: dog.temperament, behavior_traits: dog.behavior_traits, notes: dog.notes });
    setFieldErrors({});
    setStatusMessage('');
    setSelectedPhoto(null);
    setIsFormOpen(true);
  };

  const removeDogPhoto = async () => {
    const dog = dogs.find((candidate) => candidate.id === editingId);
    if (!session?.user.id || !dog?.photo_path) return;
    try {
      setIsSaving(true);
      const { error: storageError } = await supabase.storage.from('dog-profile-images').remove([dog.photo_path]);
      if (storageError) throw storageError;
      const { error: profileError } = await supabase.from('dog_profiles').update({ photo_path: null }).eq('id', dog.id).eq('user_id', session.user.id);
      if (profileError) throw profileError;
      setSelectedPhoto(null);
      await loadDogs();
      setStatusMessage('Dog photo removed.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'We could not remove this dog photo. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDog = async (dog: DogProfile) => {
    if (!session?.user.id) return;

    try {
      setIsSaving(true);
      setStatusMessage('');
      if (dog.photo_path) {
        const { error: storageError } = await supabase.storage.from('dog-profile-images').remove([dog.photo_path]);
        if (storageError) throw storageError;
      }
      const { data, error } = await supabase
        .from('dog_profiles')
        .delete()
        .eq('id', dog.id)
        .eq('user_id', session.user.id)
        .select('id');

      if (error) throw error;
      if (!data?.length) {
        throw new Error('This dog profile could not be found. Please refresh and try again.');
      }

      if (editingId === dog.id) resetForm();
      const remainingDogs = await loadDogs();
      await synchronizeDogCount(remainingDogs.length);
      Alert.alert(
        'Dog profile removed',
        remainingDogs.length === 0
          ? 'Add a dog profile before making another reservation.'
          : `${dog.name} has been removed from your dog profiles.`
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'We could not delete this dog profile. Please try again.';
      setStatusMessage(message);
      Alert.alert('Unable to delete dog profile', message);
    } finally {
      setIsSaving(false);
    }
  };

  return <SafeAreaView style={styles.safeArea}>
    <Stack.Screen options={{ title: 'Dog Profiles' }} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>DOG PROFILES</Text>
          <Text style={styles.title}>Every dog deserves{`\n`}their own profile.</Text>
          <Text style={styles.heroText}>Keep the details that help make each private-space visit safer, easier, and more personal.</Text>
        </View>
        <View style={styles.infoCard}><Text style={styles.infoTitle}>{isOnboarding ? `Now complete your ${requestedDogCount === 1 ? "dog's profile" : "dogs' profiles"}` : 'Your dog information'}</Text><Text style={styles.infoText}>{isOnboarding ? `Add the required information for ${requestedDogCount === 1 ? 'your dog' : `each of your ${requestedDogCount} dogs`}. Important notes are optional. When you select a dog for a reservation, the host will receive that dog's name, breed, size, and behavioral and social comfort details.` : "Your dog's photo and private notes stay private to your family. When you select a dog for a reservation, the host receives that dog's name, breed, size, and behavioral and social comfort details."}</Text></View>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Your dogs</Text><Text style={styles.sectionDescription}>Add each dog who may join you on a visit.</Text></View>
          {!isFormOpen ? <Pressable accessibilityRole="button" onPress={() => setIsFormOpen(true)} style={styles.addButton}><Text style={styles.addButtonText}>+ Add a Dog</Text></Pressable> : null}
        </View>
        {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : null}
        {!isLoading && dogs.length === 0 && !isFormOpen ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No dog profiles yet</Text><Text style={styles.emptyText}>Start with your dog’s name, breed, size, and a few notes that make visits more comfortable.</Text><Pressable accessibilityRole="button" onPress={() => setIsFormOpen(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Create a Dog Profile</Text></Pressable></View> : null}
        {dogs.map((dog) => <View key={dog.id} style={[styles.dogCard, { marginBottom: 5 }]}>
          {dog.photo_url ? <Image accessibilityLabel={`${dog.name}'s photo`} source={{ uri: dog.photo_url }} style={styles.dogPhoto} /> : <View style={styles.dogBadge}><Text style={styles.dogBadgeText}>{dog.name.slice(0, 1).toUpperCase()}</Text></View>}
          <View style={styles.dogCopy}><Text style={[styles.dogName, memberUi.cardTitle]}>{dog.name}</Text><Text style={[styles.dogDetails, memberUi.cardDescription]}>{[dog.breed, dog.age, dog.size].filter(Boolean).join(' · ') || 'Details can be added anytime.'}</Text>{dog.behavior_traits.length ? <View style={styles.traitPreview}>{dog.behavior_traits.map((trait) => <View key={trait} style={styles.traitChip}><Text style={styles.traitChipText}>{trait}</Text></View>)}</View> : dog.temperament ? <Text style={styles.dogTemperament}>{dog.temperament}</Text> : null}</View>
          <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={() => startEditing(dog)} style={styles.textAction}><Text style={styles.textActionText}>Edit</Text></Pressable></View>
        </View>)}
        {isFormOpen ? <View style={styles.formCard}>
          <Text style={styles.formTitle}>{editingId ? 'Edit dog profile' : 'Add a dog'}</Text><Text style={styles.formIntro}>You can add more details anytime.</Text>
          <View style={styles.photoField}>
            <Text style={styles.label}>Dog photo <Text style={styles.optional}>Optional</Text></Text>
            {selectedPhoto?.uri || dogs.find((dog) => dog.id === editingId)?.photo_url ? <Image accessibilityLabel="Dog photo preview" source={{ uri: selectedPhoto?.uri ?? dogs.find((dog) => dog.id === editingId)?.photo_url ?? undefined }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.photoPlaceholderText}>Add a photo of your dog</Text></View>}
            <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void pickDogPhoto()} style={styles.photoButton}><Text style={styles.photoButtonText}>{selectedPhoto || dogs.find((dog) => dog.id === editingId)?.photo_url ? 'Choose a Different Photo' : 'Choose a Photo'}</Text></Pressable>
            {editingId && dogs.find((dog) => dog.id === editingId)?.photo_path ? <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void removeDogPhoto()} style={styles.removePhotoButton}><Text style={styles.removePhotoButtonText}>Remove Photo</Text></Pressable> : null}
            <Text style={styles.photoPrivacyText}>This photo is private to your family and is not shown to hosts or other members.</Text>
          </View>
          <Field error={fieldErrors.name} label="Dog’s name" onChangeText={(value) => updateForm('name', value)} placeholder="For example, Scout" required value={form.name} />
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Breed or mix <Text style={styles.required}>Required</Text></Text>
            <Pressable accessibilityRole="button" onPress={() => setIsBreedPickerOpen(true)} style={[styles.breedPickerButton, fieldErrors.breed && styles.pickerError]}>
              <Text style={[styles.breedPickerText, !form.breed && styles.breedPickerPlaceholder]}>{form.breed || 'Select a breed or mix'}</Text>
              <Text style={styles.breedPickerChevron}>⌄</Text>
            </Pressable>
            {fieldErrors.breed ? <Text style={styles.fieldError}>{fieldErrors.breed}</Text> : null}
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Age <Text style={styles.required}>Required</Text></Text>
            <Pressable accessibilityRole="button" onPress={() => setIsAgePickerOpen(true)} style={[styles.breedPickerButton, fieldErrors.age && styles.pickerError]}>
              <Text style={[styles.breedPickerText, !form.age && styles.breedPickerPlaceholder]}>{form.age ? `${form.age} ${form.age === '1' ? 'year' : 'years'} old` : 'Select age'}</Text>
              <Text style={styles.breedPickerChevron}>⌄</Text>
            </Pressable>
            {fieldErrors.age ? <Text style={styles.fieldError}>{fieldErrors.age}</Text> : null}
          </View>
          <Text style={styles.label}>Size <Text style={styles.required}>Required</Text></Text><View style={styles.sizeChoices}>{sizeOptions.map((size) => <Pressable key={size} accessibilityRole="button" onPress={() => updateForm('size', size)} style={[styles.sizeChoice, form.size === size && styles.sizeChoiceSelected, fieldErrors.size && styles.sizeChoiceError]}><Text style={[styles.sizeChoiceText, form.size === size && styles.sizeChoiceTextSelected]}>{size}</Text></Pressable>)}</View>{fieldErrors.size ? <Text style={[styles.fieldError, styles.sizeError]}>{fieldErrors.size}</Text> : null}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Behavior & Social Comfort <Text style={styles.required}>Required</Text></Text>
            <Pressable accessibilityRole="button" onPress={() => setIsBehaviorPickerOpen(true)} style={[styles.breedPickerButton, fieldErrors.behavior_traits && styles.pickerError]}>
              <Text style={[styles.breedPickerText, form.behavior_traits.length === 0 && styles.breedPickerPlaceholder]}>{form.behavior_traits.length ? `${form.behavior_traits.length} ${form.behavior_traits.length === 1 ? 'trait' : 'traits'} selected` : 'Select all that apply'}</Text>
              <Text style={styles.breedPickerChevron}>⌄</Text>
            </Pressable>
            {form.behavior_traits.length ? <View style={styles.traitPreview}>{form.behavior_traits.map((trait) => <View key={trait} style={styles.traitChip}><Text style={styles.traitChipText}>{trait}</Text></View>)}</View> : null}
            {fieldErrors.behavior_traits ? <Text style={styles.fieldError}>{fieldErrors.behavior_traits}</Text> : null}
          </View>
          <Field label="Important notes" multiline onChangeText={(value) => updateForm('notes', value)} placeholder="Anything that will help you plan a great visit." value={form.notes} />
          {statusMessage ? <View style={styles.statusBanner}><Text style={styles.statusText}>{statusMessage}</Text></View> : null}
          <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void saveDog()} style={[styles.primaryButton, isSaving && styles.buttonDisabled]}>{isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>{editingId ? 'Save Changes' : 'Save Dog Profile'}</Text>}</Pressable>
          {editingId ? <Pressable accessibilityRole="button" accessibilityLabel="Delete this dog profile" disabled={isSaving} onPress={() => { const dog = dogs.find((candidate) => candidate.id === editingId); if (dog) void deleteDog(dog); }} style={[styles.deleteProfileButton, isSaving && styles.buttonDisabled]}>{isSaving ? <ActivityIndicator color={colors.brown} /> : <Text style={styles.deleteProfileButtonText}>Delete Dog Profile</Text>}</Pressable> : null}
          {!isOnboarding || editingId ? <Pressable accessibilityRole="button" disabled={isSaving} onPress={resetForm} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable> : null}
        </View> : null}
        <Pressable accessibilityRole="button" onPress={() => router.replace('/profile?onboarding=true')} style={styles.returnToParentButton}>
          <Text style={styles.returnToParentButtonText}>Return to Parent Profile</Text>
        </Pressable>
        <HostPageGuide
          title="How to use Dog Profiles"
          intro="Dog Profiles help you choose which dogs attend each visit and give hosts the details needed to prepare."
          tone="forest"
          steps={[
            { title: 'Add each dog', text: 'Enter the name, breed or mix, age, size, and behavior details for every dog you may bring.' },
            { title: 'Add a photo', text: 'A photo is optional and helps you recognize the dogs attached to a reservation.' },
            { title: 'Choose traits carefully', text: 'Select the traits that best describe your dog. Hosts see visit details only when you select that dog for a reservation.' },
            { title: 'Save, then choose dogs', text: 'Save the profile. On your next reservation, select the dogs that will attend.' },
          ]}
        />
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal animationType="slide" onRequestClose={() => setIsBreedPickerOpen(false)} transparent visible={isBreedPickerOpen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.breedModal}>
          <View style={styles.breedModalHeader}>
            <Text style={styles.breedModalTitle}>Select a breed or mix</Text>
            <Pressable accessibilityLabel="Close breed list" accessibilityRole="button" onPress={() => setIsBreedPickerOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>Close</Text></Pressable>
          </View>
          <TextInput autoCapitalize="words" autoCorrect={false} onChangeText={setBreedSearch} placeholder="Search breeds" placeholderTextColor="#8A877D" style={styles.breedSearchInput} value={breedSearch} />
          <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} style={styles.breedList}>
            {matchingBreeds.map((breed) => <Pressable key={breed} accessibilityRole="button" onPress={() => { updateForm('breed', breed); setBreedSearch(''); setIsBreedPickerOpen(false); }} style={[styles.breedOption, form.breed === breed && styles.breedOptionSelected]}><Text style={[styles.breedOptionText, form.breed === breed && styles.breedOptionTextSelected]}>{breed}</Text></Pressable>)}
            {matchingBreeds.length === 0 ? <Text style={styles.noBreedsText}>No matching breed found. Try a different search.</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal animationType="slide" onRequestClose={() => setIsAgePickerOpen(false)} transparent visible={isAgePickerOpen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.ageModal}>
          <View style={styles.breedModalHeader}>
            <Text style={styles.breedModalTitle}>Select age</Text>
            <Pressable accessibilityLabel="Close age list" accessibilityRole="button" onPress={() => setIsAgePickerOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>Close</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.breedList}>
            {ageOptions.map((age) => <Pressable key={age} accessibilityRole="button" onPress={() => { updateForm('age', age); setIsAgePickerOpen(false); }} style={[styles.breedOption, form.age === age && styles.breedOptionSelected]}><Text style={[styles.breedOptionText, form.age === age && styles.breedOptionTextSelected]}>{age} {age === '1' ? 'year old' : 'years old'}</Text></Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal animationType="slide" onRequestClose={() => setIsBehaviorPickerOpen(false)} transparent visible={isBehaviorPickerOpen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.behaviorModal}>
          <View style={styles.breedModalHeader}>
            <Text style={styles.breedModalTitle}>Behavior & Social Comfort</Text>
            <Pressable accessibilityLabel="Close behavior picker" accessibilityRole="button" onPress={() => setIsBehaviorPickerOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>Done</Text></Pressable>
          </View>
          <Text style={styles.behaviorIntro}>Choose every trait that applies. You can update these anytime.</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.behaviorList}>
            <View style={styles.behaviorGrid}>{behaviorOptions.map((trait) => {
              const isSelected = form.behavior_traits.includes(trait);
              return <Pressable key={trait} accessibilityRole="button" onPress={() => updateForm('behavior_traits', isSelected ? form.behavior_traits.filter((selected) => selected !== trait) : [...form.behavior_traits, trait])} style={[styles.behaviorOption, isSelected && styles.behaviorOptionSelected]}><Text style={[styles.behaviorOptionText, isSelected && styles.behaviorOptionTextSelected]}>{trait}</Text></Pressable>;
            })}</View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function Field({ error, label, multiline, onChangeText, placeholder, required, value }: { error?: string; label: string; multiline?: boolean; onChangeText: (value: string) => void; placeholder: string; required?: boolean; value: string }) {
  return <View style={styles.fieldGroup}><Text style={styles.label}>{label}{required ? <Text style={styles.required}> Required</Text> : null}</Text><TextInput multiline={multiline} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8A877D" style={[styles.input, multiline && styles.multilineInput, error && styles.inputError]} textAlignVertical={multiline ? 'top' : 'center'} value={value} />{error ? <Text style={styles.fieldError}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, keyboardView: { flex: 1 }, container: { padding: 20, paddingBottom: 44 },
  hero: { backgroundColor: colors.forest, borderRadius: 24, padding: 22 }, eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10 }, title: { color: colors.warmWhite, fontSize: 30, fontWeight: '900', lineHeight: 36 }, heroText: { color: '#E4EDE0', fontSize: 15, lineHeight: 22, marginTop: 14 },
  infoCard: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 16 }, infoTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', marginBottom: 5 }, infoText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13, marginTop: 28 }, sectionTitle: { color: colors.forest, fontSize: 23, fontWeight: '900', lineHeight: 29 }, sectionDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 3 }, addButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginLeft: 12, minHeight: 42, paddingHorizontal: 12 }, addButtonText: { color: colors.brown, fontSize: 14, fontWeight: '900' }, loading: { paddingVertical: 42 },
  emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, padding: 20 }, emptyTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 7 }, emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  dogCard: { alignItems: 'flex-start', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', marginBottom: 12, padding: 16 }, dogBadge: { alignItems: 'center', backgroundColor: '#E7C79D', borderRadius: 24, height: 48, justifyContent: 'center', marginRight: 12, width: 48 }, dogPhoto: { borderColor: colors.border, borderRadius: 24, borderWidth: 1, height: 48, marginRight: 12, width: 48 }, dogBadgeText: { color: colors.forest, fontSize: 20, fontWeight: '900' }, dogCopy: { flex: 1, paddingRight: 8 }, dogName: { color: colors.forest, fontSize: 18, fontWeight: '900', lineHeight: 23 }, dogDetails: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 }, dogTemperament: { color: colors.brown, fontSize: 13, fontWeight: '800', lineHeight: 18, marginTop: 5 }, traitPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, traitChip: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 }, traitChipText: { color: colors.forest, fontSize: 11, fontWeight: '800', lineHeight: 14 }, cardActions: { alignItems: 'flex-end' }, textAction: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 70 }, textActionText: { color: colors.brown, fontSize: 13, fontWeight: '900' }, deleteProfileButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 54 }, deleteProfileButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' },
  formCard: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 20, borderWidth: 1, marginTop: 4, padding: 18 }, formTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginBottom: 5 }, formIntro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 17 }, fieldGroup: { marginBottom: 15 }, label: { color: colors.forest, fontSize: 14, fontWeight: '800', marginBottom: 7 }, required: { color: colors.brown, fontSize: 12, fontWeight: '800' }, optional: { color: colors.muted, fontSize: 12, fontWeight: '700' }, input: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 16, minHeight: 52, paddingHorizontal: 14 }, inputError: { borderColor: colors.red, borderWidth: 2 }, fieldError: { color: colors.red, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 5 }, multilineInput: { minHeight: 96, paddingBottom: 13, paddingTop: 13 },
  photoField: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginBottom: 18, padding: 14 }, photoPreview: { alignSelf: 'center', borderColor: '#E7C79D', borderRadius: 56, borderWidth: 2, height: 112, marginBottom: 14, width: 112 }, photoPlaceholder: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 56, borderStyle: 'dashed', borderWidth: 1, height: 112, justifyContent: 'center', marginBottom: 14, padding: 12, width: 112 }, photoPlaceholderText: { color: colors.forest, fontSize: 13, fontWeight: '800', lineHeight: 18, textAlign: 'center' }, photoButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44 }, photoButtonText: { color: colors.brown, fontSize: 14, fontWeight: '900' }, removePhotoButton: { alignItems: 'center', justifyContent: 'center', marginTop: 5, minHeight: 40 }, removePhotoButtonText: { color: colors.red, fontSize: 13, fontWeight: '900' }, photoPrivacyText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  breedPickerButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14 }, pickerError: { borderColor: colors.red, borderWidth: 2 }, breedPickerText: { color: colors.forest, flex: 1, fontSize: 16 }, breedPickerPlaceholder: { color: '#8A877D' }, breedPickerChevron: { color: colors.brown, fontSize: 22, fontWeight: '900', marginLeft: 12, marginTop: -4 },
  sizeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 5 }, sizeChoice: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 12 }, sizeChoiceError: { borderColor: colors.red }, sizeChoiceSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, sizeChoiceText: { color: colors.forest, fontSize: 13, fontWeight: '800' }, sizeChoiceTextSelected: { color: colors.warmWhite }, sizeError: { marginBottom: 16 },
  statusBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 13, borderWidth: 1, marginBottom: 14, padding: 13 }, statusText: { color: colors.red, fontSize: 14, fontWeight: '800', lineHeight: 20 }, primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', minHeight: 54, paddingHorizontal: 18 }, primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, buttonDisabled: { opacity: 0.65 }, cancelButton: { alignItems: 'center', justifyContent: 'center', marginTop: 6, minHeight: 46 }, cancelButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  returnToParentButton: { alignItems: 'center', justifyContent: 'center', marginTop: 22, minHeight: 48 }, returnToParentButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  modalBackdrop: { backgroundColor: 'rgba(20, 38, 24, 0.58)', flex: 1, justifyContent: 'flex-end' }, breedModal: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '84%', padding: 20 }, breedModalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }, breedModalTitle: { color: colors.forest, fontSize: 20, fontWeight: '900' }, closeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 38, paddingHorizontal: 4 }, closeButtonText: { color: colors.brown, fontSize: 14, fontWeight: '900' }, breedSearchInput: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 16, minHeight: 50, paddingHorizontal: 14 }, breedList: { marginTop: 12 }, breedOption: { borderBottomColor: colors.border, borderBottomWidth: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 6 }, breedOptionSelected: { backgroundColor: colors.lightGreen }, breedOptionText: { color: colors.forest, fontSize: 16 }, breedOptionTextSelected: { fontWeight: '900' }, noBreedsText: { color: colors.muted, fontSize: 15, lineHeight: 21, paddingVertical: 22, textAlign: 'center' },
  ageModal: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%', padding: 20 }, behaviorModal: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '78%', padding: 20 }, behaviorIntro: { color: colors.muted, fontSize: 14, lineHeight: 20 }, behaviorList: { marginTop: 16 }, behaviorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 }, behaviorOption: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 10, width: '47.5%' }, behaviorOptionSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, behaviorOptionText: { color: colors.forest, fontSize: 13, fontWeight: '800', lineHeight: 17, textAlign: 'center' }, behaviorOptionTextSelected: { color: colors.warmWhite },
});
