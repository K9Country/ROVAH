import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Image,
    KeyboardAvoidingView,
    Modal,
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

import { colors } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../services/auth-context';
import type {
    Property,
    PropertyAvailability,
    PropertyDateAvailability,
    PropertyDraftDetails,
    PropertyImage,
} from '../../../types/property';

const amenityOptions = [
  { code: 'water', label: 'Water bowl', icon: 'Water' },
  { code: 'shade', label: 'Shade', icon: 'Tree' },
  { code: 'picnic_table', label: 'Picnic table', icon: 'Table' },
  { code: 'restroom', label: 'Restroom', icon: 'Restroom' },
  { code: 'parking', label: 'Parking', icon: 'Parking' },
  { code: 'tennis_ball', label: 'Tennis ball', icon: 'Ball' },
  { code: 'frisbee', label: 'Frisbee', icon: 'Disc' },
  { code: 'agility_equipment', label: 'Agility equipment', icon: 'Jump' },
  { code: 'swimming_pool', label: 'Swimming pool', icon: 'Pool' },
  { code: 'agility_course', label: 'Agility course', icon: 'Course' },
  { code: 'hiking_trails', label: 'Hiking trails', icon: 'Trail' },
  { code: 'lake_access', label: 'Lake access', icon: 'Lake' },
  { code: 'poop_bags', label: 'Poop bags', icon: '💩' },
  { code: 'wheelchair_accessible', label: 'Wheelchair accessible', icon: 'Access' },
] as const;

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

type DaySchedule = PropertyAvailability & { enabled: boolean };
type TimePickerTarget =
  | { kind: 'template-start' | 'template-end' }
  | { kind: 'day-start' | 'day-end'; day: number }
  | null;
type DateAvailabilityOverride = Omit<PropertyDateAvailability, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

const defaultSchedule = (): DaySchedule[] =>
  dayNames.map((_, day_of_week) => ({
    day_of_week,
    start_time: '08:00',
    end_time: '17:00',
    enabled: false,
  }));

const halfHourTimes = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
});

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function datesInCalendarMonth(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export default function PropertyDraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [details, setDetails] = useState<PropertyDraftDetails>({
    property_id: id ?? '',
    parking_instructions: '',
    gate_access_instructions: '',
    arrival_instructions: '',
    property_rules: '',
    availability_notes: '',
  });
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule);
  const [templateStartTime, setTemplateStartTime] = useState('08:00');
  const [templateEndTime, setTemplateEndTime] = useState('17:00');
  const [selectedScheduleDays, setSelectedScheduleDays] = useState<number[]>([]);
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget>(null);
  const [dateAvailability, setDateAvailability] = useState<DateAvailabilityOverride[]>([]);
  const [availabilityCalendarMonth, setAvailabilityCalendarMonth] = useState(() => startOfDay(new Date()));
  const [selectedCalendarDates, setSelectedCalendarDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [primaryImageId, setPrimaryImageId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const loadDraft = useCallback(async () => {
    if (!id || !session?.user.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const [propertyResult, detailsResult, amenitiesResult, availabilityResult, imagesResult, dateAvailabilityResult] =
      await Promise.all([
        supabase.from('properties').select('*').eq('id', id).eq('host_id', session.user.id).maybeSingle(),
        supabase.from('property_draft_details').select('*').eq('property_id', id).maybeSingle(),
        supabase.from('property_amenities').select('amenity_code').eq('property_id', id),
        supabase.from('property_availability').select('day_of_week, start_time, end_time').eq('property_id', id),
        supabase.from('property_images').select('*').eq('property_id', id).order('display_order'),
        supabase.from('property_date_availability').select('*').eq('property_id', id).order('availability_date'),
      ]);

    const firstError = [
      propertyResult.error,
      detailsResult.error,
      amenitiesResult.error,
      availabilityResult.error,
      imagesResult.error,
      dateAvailabilityResult.error,
    ].find(Boolean);

    if (firstError) {
      Alert.alert('Unable to load property', firstError.message);
      setIsLoading(false);
      return;
    }

    setProperty(propertyResult.data as Property | null);
    if (detailsResult.data) setDetails(detailsResult.data as PropertyDraftDetails);
    setSelectedAmenities((amenitiesResult.data ?? []).map((item) => item.amenity_code));
    setDateAvailability((dateAvailabilityResult.data ?? []) as DateAvailabilityOverride[]);

    const savedAvailability = (availabilityResult.data ?? []) as PropertyAvailability[];
    if (savedAvailability[0]) {
      setTemplateStartTime(normalizeTime(savedAvailability[0].start_time));
      setTemplateEndTime(normalizeTime(savedAvailability[0].end_time));
    }
    setSchedule(
      dayNames.map((_, day_of_week) => {
        const saved = savedAvailability.find((item) => item.day_of_week === day_of_week);

        return saved
          ? {
              ...saved,
              start_time: normalizeTime(saved.start_time),
              end_time: normalizeTime(saved.end_time),
              enabled: true,
            }
          : {
              day_of_week,
              start_time: '08:00',
              end_time: '17:00',
              enabled: false,
            };
      })
    );

    const imageRows = (imagesResult.data ?? []) as PropertyImage[];
    const imagesWithUrls = await Promise.all(
      imageRows.map(async (image) => {
        const { data } = await supabase.storage
          .from('property-images')
          .createSignedUrl(image.storage_path, 60 * 60);
        return { ...image, signed_url: data?.signedUrl };
      })
    );
    setImages(imagesWithUrls);
    setHasUnsavedChanges(false);
    setIsLoading(false);
  }, [id, session?.user.id]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const leavePropertyDetails = useCallback(() => {
    const leave = () => router.replace('/host-dashboard');

    if (!hasUnsavedChanges) {
      leave();
      return;
    }

    Alert.alert(
      'Leave without saving?',
      'Your changes to this property have not been saved.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Continue Without Saving',
          style: 'destructive',
          onPress: leave,
        },
      ]
    );
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!hasUnsavedChanges) {
          return false;
        }

        leavePropertyDetails();
        return true;
      }
    );

    return () => subscription.remove();
  }, [hasUnsavedChanges, leavePropertyDetails]);

  const addPhotos = async () => {
    if (!id || !session?.user.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to add images to this property draft.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    });
    if (result.canceled) return;

    try {
      setIsUploading(true);
      for (const [index, asset] of result.assets.entries()) {
        const extension = asset.fileName?.split('.').pop() ?? asset.mimeType?.split('/').pop() ?? 'jpg';
        const path = `${session.user.id}/${id}/${Date.now()}-${index}.${extension}`;
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(path, arrayBuffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;

        const { error: imageError } = await supabase.from('property_images').insert({
          property_id: id,
          storage_path: path,
          display_order: images.length + index,
          is_cover: images.length === 0 && index === 0,
        });
        if (imageError) throw imageError;
      }
      await loadDraft();
      setHasUnsavedChanges(true);
    } catch (error) {
      Alert.alert('Unable to upload photo', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = async (image: PropertyImage) => {
    if (!id || !session?.user.id) return;

    try {
      const { error: storageError } = await supabase.storage.from('property-images').remove([image.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from('property_images').delete().eq('id', image.id);
      if (rowError) throw rowError;

      if (image.is_cover) {
        const replacement = images.find((candidate) => candidate.id !== image.id);

        if (replacement) {
          const { error: replacementError } = await supabase
            .from('property_images')
            .update({ is_cover: true })
            .eq('id', replacement.id)
            .eq('property_id', id);
          if (replacementError) throw replacementError;

          const { error: propertyError } = await supabase
            .from('properties')
            .update({ hero_image_url: replacement.storage_path })
            .eq('id', id)
            .eq('host_id', session.user.id);
          if (propertyError) throw propertyError;
        } else {
          const { error: propertyError } = await supabase
            .from('properties')
            .update({ hero_image_url: null })
            .eq('id', id)
            .eq('host_id', session.user.id);
          if (propertyError) throw propertyError;
        }
      }

      await loadDraft();
      setHasUnsavedChanges(true);
    } catch (error) {
      Alert.alert('Unable to remove photo', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const setPrimaryPhoto = async (image: PropertyImage) => {
    if (!id || !session?.user.id || image.is_cover || primaryImageId) return;

    try {
      setPrimaryImageId(image.id);

      const { error: clearCoverError } = await supabase
        .from('property_images')
        .update({ is_cover: false })
        .eq('property_id', id);
      if (clearCoverError) throw clearCoverError;

      const { error: setCoverError } = await supabase
        .from('property_images')
        .update({ is_cover: true })
        .eq('id', image.id)
        .eq('property_id', id);
      if (setCoverError) throw setCoverError;

      const { error: propertyError } = await supabase
        .from('properties')
        .update({ hero_image_url: image.storage_path })
        .eq('id', id)
        .eq('host_id', session.user.id);
      if (propertyError) throw propertyError;

      setProperty((current) =>
        current ? { ...current, hero_image_url: image.storage_path } : current
      );
      await loadDraft();
      setHasUnsavedChanges(true);
    } catch (error) {
      Alert.alert(
        'Unable to set primary photo',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setPrimaryImageId(null);
    }
  };

  const toggleAmenity = (code: string) => {
    setSelectedAmenities((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    );
    setHasUnsavedChanges(true);
  };

  const updateSchedule = (day: number, changes: Partial<DaySchedule>) => {
    setSchedule((current) =>
      current.map((item) =>
        item.day_of_week === day ? { ...item, ...changes } : item
      )
    );
    setHasUnsavedChanges(true);
  };

  const toggleScheduleDaySelection = (day: number) => {
    setSelectedScheduleDays((current) =>
      current.includes(day)
        ? current.filter((selectedDay) => selectedDay !== day)
        : [...current, day]
    );
  };

  const applyTemplateHours = async () => {
    if (!/^\d{2}:\d{2}$/.test(templateStartTime) || !/^\d{2}:\d{2}$/.test(templateEndTime) || templateStartTime >= templateEndTime) {
      Alert.alert('Check the hours', 'Enter an opening time that is earlier than the closing time.');
      return;
    }

    if (selectedScheduleDays.length === 0) {
      Alert.alert('Select days', 'Choose one or more days before applying these hours.');
      return;
    }

    const nextSchedule = schedule.map((day) =>
      selectedScheduleDays.includes(day.day_of_week)
        ? { ...day, enabled: true, start_time: templateStartTime, end_time: templateEndTime }
        : day
    );
    setSchedule(nextSchedule);
    setHasUnsavedChanges(true);
    await saveListing(false, nextSchedule);
  };

  const chooseTime = (time: string) => {
    if (!timePickerTarget) return;

    if (timePickerTarget.kind === 'template-start') {
      setTemplateStartTime(time);
    } else if (timePickerTarget.kind === 'template-end') {
      setTemplateEndTime(time);
    } else if (timePickerTarget.kind === 'day-start') {
      updateSchedule(timePickerTarget.day, { start_time: time });
    } else if (timePickerTarget.kind === 'day-end') {
      updateSchedule(timePickerTarget.day, { end_time: time });
    }

    setTimePickerTarget(null);
  };

  const getCalendarDateOpen = (date: Date) => {
    const override = dateAvailability.find((item) => item.availability_date === dateKey(date));
    if (override) return override.is_open;
    return schedule.find((item) => item.day_of_week === date.getDay())?.enabled ?? false;
  };

  const toggleCalendarDateSelection = (date: Date) => {
    const key = dateKey(date);
    setSelectedCalendarDates((current) =>
      current.includes(key)
        ? current.filter((selectedDate) => selectedDate !== key)
        : [...current, key]
    );
  };

  const setSelectedCalendarDatesAvailability = (isOpen: boolean) => {
    if (selectedCalendarDates.length === 0) {
      Alert.alert('Select dates', 'Tap one or more calendar days first.');
      return;
    }

    const selectedDaySchedules = selectedCalendarDates.map((availabilityDate) => {
      const dayOfWeek = new Date(`${availabilityDate}T12:00:00`).getDay();
      return schedule.find((day) => day.day_of_week === dayOfWeek);
    });

    if (
      isOpen &&
      selectedDaySchedules.some(
        (day) => !day || day.start_time >= day.end_time
      )
    ) {
      Alert.alert('Check the hours', 'Choose an opening time that is earlier than the closing time.');
      return;
    }

    setDateAvailability((current) => {
      const next = current.filter((item) => !selectedCalendarDates.includes(item.availability_date));
      return [
        ...next,
        ...selectedCalendarDates.map((availability_date) => {
          const dayOfWeek = new Date(`${availability_date}T12:00:00`).getDay();
          const weekdaySchedule = schedule.find((day) => day.day_of_week === dayOfWeek);

          return {
            property_id: id ?? '',
            availability_date,
            is_open: isOpen,
            start_time: isOpen ? weekdaySchedule?.start_time ?? templateStartTime : null,
            end_time: isOpen ? weekdaySchedule?.end_time ?? templateEndTime : null,
          };
        }),
      ];
    });
    setSelectedCalendarDates([]);
    setHasUnsavedChanges(true);
  };

  async function saveListing(submitForReview: boolean, scheduleToSave = schedule) {
    if (!id || !property || !session?.user.id) return;
    const wasPublished = property.is_published;
    const openDays = scheduleToSave.filter((day) => day.enabled);
    const invalidDay = openDays.find(
      (day) =>
        !/^\d{2}:\d{2}$/.test(day.start_time) ||
        !/^\d{2}:\d{2}$/.test(day.end_time) ||
        day.start_time >= day.end_time
    );

    if (submitForReview && images.length === 0) {
      Alert.alert('Add a property photo', 'Upload at least one photo before publishing your listing.');
      return;
    }

    if (submitForReview && !property.site_address.trim()) {
      Alert.alert('Add the site address', 'Add the exact street address so guests can open the correct location in Google Maps.');
      return;
    }

    if (submitForReview && (
      !details.parking_instructions.trim() ||
      !details.gate_access_instructions.trim() ||
      !details.property_rules.trim()
    )) {
      Alert.alert(
        'Complete property details and rules',
        'Add parking, gate access, and guest rules before publishing.'
      );
      return;
    }

    if (submitForReview && selectedAmenities.length === 0) {
      Alert.alert('Add amenities', 'Select at least one amenity for Know Before You Go.');
      return;
    }

    const primaryPhoto = images.find((image) => image.is_cover) ?? images[0];

    if (submitForReview && invalidDay) {
      Alert.alert(
        'Check your schedule',
        'For an open day, choose an opening time that is earlier than the closing time.'
      );
      return;
    }

    try {
      setIsPublishing(true);

      const { error: detailsError } = await supabase.from('property_draft_details').upsert(
        { ...details, property_id: id },
        { onConflict: 'property_id' }
      );
      if (detailsError) throw detailsError;

      const { error: amenitiesDeleteError } = await supabase
        .from('property_amenities')
        .delete()
        .eq('property_id', id);
      if (amenitiesDeleteError) throw amenitiesDeleteError;

      if (selectedAmenities.length > 0) {
        const { error: amenitiesInsertError } = await supabase.from('property_amenities').insert(
          selectedAmenities.map((amenity_code) => ({ property_id: id, amenity_code }))
        );
        if (amenitiesInsertError) throw amenitiesInsertError;
      }

      const { error: availabilityDeleteError } = await supabase
        .from('property_availability')
        .delete()
        .eq('property_id', id);
      if (availabilityDeleteError) throw availabilityDeleteError;

      if (openDays.length > 0) {
        const { error: availabilityInsertError } = await supabase
          .from('property_availability')
          .insert(
            openDays.map(({ day_of_week, start_time, end_time }) => ({
              property_id: id,
              day_of_week,
              start_time,
              end_time,
            }))
          );
        if (availabilityInsertError) throw availabilityInsertError;
      }

      const { error: dateAvailabilityDeleteError } = await supabase
        .from('property_date_availability')
        .delete()
        .eq('property_id', id);
      if (dateAvailabilityDeleteError) throw dateAvailabilityDeleteError;

      if (dateAvailability.length > 0) {
        const { error: dateAvailabilityInsertError } = await supabase
          .from('property_date_availability')
          .insert(
            dateAvailability.map(({ availability_date, is_open, start_time, end_time }) => ({
              property_id: id,
              availability_date,
              is_open,
              start_time,
              end_time,
            }))
          );
        if (dateAvailabilityInsertError) throw dateAvailabilityInsertError;
      }

      const { error: publishError } = await supabase
        .from('properties')
        .update({
          is_published: submitForReview ? false : property.is_published,
          approval_status: submitForReview ? 'pending' : property.approval_status,
          hero_image_url: primaryPhoto?.storage_path ?? property.hero_image_url,
          is_temporarily_closed: property.is_temporarily_closed,
          site_address: property.site_address.trim(),
        })
        .eq('id', id)
        .eq('host_id', session.user.id);
      if (publishError) throw publishError;

      setProperty((current) =>
        current
          ? {
              ...current,
              is_published: submitForReview ? false : current.is_published,
              approval_status: submitForReview ? 'pending' : current.approval_status,
              hero_image_url: primaryPhoto?.storage_path ?? current.hero_image_url,
              site_address: current.site_address.trim(),
            }
          : current
      );
      setHasUnsavedChanges(false);

      if (submitForReview && !wasPublished) {
        router.replace('/host-dashboard');
      } else if (!submitForReview) {
        Alert.alert('Draft saved', 'Your updates are saved privately. Submit the listing for review when you are ready.');
      }
    } catch (error) {
      Alert.alert(
        'Unable to save listing',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsPublishing(false);
    }
  }

  const deleteListing = () => {
    if (!id || !property || !session?.user.id || isDeleting) return;

    Alert.alert(
      'Delete this listing?',
      `This permanently deletes ${property.name}, including its details and photos. This cannot be undone.`,
      [
        { text: 'Keep Listing', style: 'cancel' },
        {
          text: 'Delete Listing',
          style: 'destructive',
          onPress: () => void confirmDeleteListing(),
        },
      ]
    );
  };

  const confirmDeleteListing = async () => {
    if (!id || !session?.user.id || isDeleting) return;

    try {
      setIsDeleting(true);

      const imagePaths = images.map((image) => image.storage_path);
      const { error: propertyError } = await supabase
        .from('properties')
        .delete()
        .eq('id', id)
        .eq('host_id', session.user.id);

      if (propertyError) throw propertyError;

      if (imagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('property-images')
          .remove(imagePaths);
        if (storageError) {
          console.error('Listing was deleted, but photo cleanup failed:', storageError.message);
        }
      }

      router.replace('/host-dashboard');
    } catch (error) {
      Alert.alert(
        'Unable to delete listing',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading property details..." />;
  }

  if (!property) {
    return <LoadingState message="This property was not found." actionLabel="Back to Hosting" onAction={() => router.replace('/host-dashboard')} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={leavePropertyDetails} style={styles.backButton}>
            <Text style={styles.backButtonText}>{'<'} Host Dashboard</Text>
          </Pressable>
          <Text style={styles.eyebrow}>PROPERTY DETAILS</Text>
          <Text style={styles.title}>{property.name}</Text>
          <Text style={styles.description}>Complete these details so guests know exactly what to expect before they arrive.</Text>

          <Section title="Photos" subtitle={`${images.length} uploaded`} icon="Photos" requiredForReview>
            <View style={styles.imageGrid}>
              {images.map((image) => (
                <View key={image.id} style={styles.imageTile}>
                  <View style={styles.photoPreview}>
                    {image.signed_url ? <Image source={{ uri: image.signed_url }} style={styles.image} /> : <View style={styles.imageFallback}><Text>Photo</Text></View>}
                  </View>

                  <View style={styles.photoActions}>
                    {image.is_cover ? (
                      <View style={styles.primaryPhotoBadge}>
                        <Text style={styles.primaryPhotoBadgeText}>Primary</Text>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        disabled={primaryImageId !== null}
                        onPress={() => setPrimaryPhoto(image)}
                        style={[styles.primaryPhotoButton, primaryImageId !== null && styles.disabled]}
                      >
                        {primaryImageId === image.id ? (
                          <ActivityIndicator color="#FFFDF8" size="small" />
                        ) : (
                          <Text style={styles.primaryPhotoButtonText}>Make Primary</Text>
                        )}
                      </Pressable>
                    )}

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => removePhoto(image)}
                      style={styles.removePhoto}
                    >
                      <Text style={styles.removePhotoText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            <Pressable disabled={isUploading} onPress={addPhotos} style={[styles.secondaryButton, isUploading && styles.disabled]}>
              {isUploading ? <ActivityIndicator color="#263A24" /> : <Text style={styles.secondaryButtonText}>Add Property Photos</Text>}
            </Pressable>
          </Section>

          <Section title="Arrival Details" subtitle="Parking, gate access, directions, and your exact map location" icon="Gate">
            <DraftField label="Site street address" value={property.site_address} onChangeText={(value) => { setProperty((current) => current ? { ...current, site_address: value } : current); setHasUnsavedChanges(true); }} placeholder="123 Country Lane" requiredForReview />
            <DraftField label="Parking instructions" value={details.parking_instructions} onChangeText={(value) => { setDetails((current) => ({ ...current, parking_instructions: value })); setHasUnsavedChanges(true); }} placeholder="Where should guests park?" requiredForReview multiline />
            <DraftField label="Gate access" value={details.gate_access_instructions} onChangeText={(value) => { setDetails((current) => ({ ...current, gate_access_instructions: value })); setHasUnsavedChanges(true); }} placeholder="Which gate should guests use and how do they enter?" requiredForReview multiline />
          </Section>

          <Section title="Property Rules" subtitle="Set clear expectations before booking" icon="Rules">
            <DraftField label="Rules for guests" value={details.property_rules} onChangeText={(value) => { setDetails((current) => ({ ...current, property_rules: value })); setHasUnsavedChanges(true); }} placeholder="Example: Close the gate behind you, keep dogs supervised, and remove all waste." requiredForReview multiline />
          </Section>

          <Section title="Amenities" subtitle="Used in Know Before You Go" icon="Amenities" requiredForReview>
            <View style={styles.amenityGrid}>
              {amenityOptions.map((amenity) => {
                const selected = selectedAmenities.includes(amenity.code);
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={amenity.code}
                    onPress={() => toggleAmenity(amenity.code)}
                    style={[styles.amenity, selected && styles.amenitySelected]}
                  >
                    <Text style={styles.amenityIcon}>{amenity.icon}</Text>
                    <Text style={[styles.amenityText, selected && styles.amenityTextSelected]}>
                      {amenity.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section
            title="Availability"
            subtitle="Open or close days quickly, then reuse the same hours wherever you need them."
            icon="Calendar"
          >
            <View style={styles.quickHoursCard}>
              <Text style={styles.quickHoursTitle}>Apply hours</Text>
              <Text style={styles.quickHoursText}>Every day starts red and closed. Tap each day you want to open so it turns green, then apply the hours.</Text>

              <View style={styles.templateTimeRow}>
                <View style={styles.templateTimeField}>
                  <Text style={styles.templateTimeLabel}>Open</Text>
                  <Pressable
                    accessibilityLabel="Template opening time"
                    onPress={() => setTimePickerTarget({ kind: 'template-start' })}
                    style={styles.timeSelector}
                  >
                    <Text style={styles.timeSelectorText}>{formatTimeLabel(templateStartTime)}</Text>
                    <Text style={styles.timeSelectorHint}>⌄</Text>
                  </Pressable>
                </View>

                <View style={styles.templateTimeField}>
                  <Text style={styles.templateTimeLabel}>Close</Text>
                  <Pressable
                    accessibilityLabel="Template closing time"
                    onPress={() => setTimePickerTarget({ kind: 'template-end' })}
                    style={styles.timeSelector}
                  >
                    <Text style={styles.timeSelectorText}>{formatTimeLabel(templateEndTime)}</Text>
                    <Text style={styles.timeSelectorHint}>⌄</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.dayPickerRow}>
                {dayNames.map((day, index) => {
                  const selected = selectedScheduleDays.includes(index);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={day}
                      onPress={() => toggleScheduleDaySelection(index)}
                      style={[
                        styles.dayPickerButton,
                        selected ? styles.dayPickerButtonOpen : styles.dayPickerButtonClosed,
                      ]}
                    >
                      <Text style={[styles.dayPickerText, !selected && styles.dayPickerTextClosed]}>{day.slice(0, 1)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable accessibilityRole="button" disabled={isPublishing} onPress={() => void applyTemplateHours()} style={[styles.applyHoursButton, isPublishing && styles.disabled]}>
                {isPublishing ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Text style={styles.applyHoursButtonText}>Apply & Save Hours</Text>}
              </Pressable>
            </View>

            {schedule.map((day) => (
              <View key={day.day_of_week} style={styles.scheduleRow}>
                <View style={styles.scheduleDayCell}>
                  <Text style={styles.scheduleDay}>{dayNames[day.day_of_week]}</Text>
                  <View style={styles.dayTimeRow}>
                    <Pressable
                      accessibilityLabel={`${dayNames[day.day_of_week]} opening time`}
                      onPress={() => setTimePickerTarget({ kind: 'day-start', day: day.day_of_week })}
                      style={styles.dayTimeSelector}
                    >
                      <Text style={styles.dayTimeSelectorText}>{formatTimeLabel(day.start_time)}</Text>
                      <Text style={styles.dayTimeSelectorHint}>⌄</Text>
                    </Pressable>
                    <Text style={styles.dayTimeSeparator}>to</Text>
                    <Pressable
                      accessibilityLabel={`${dayNames[day.day_of_week]} closing time`}
                      onPress={() => setTimePickerTarget({ kind: 'day-end', day: day.day_of_week })}
                      style={styles.dayTimeSelector}
                    >
                      <Text style={styles.dayTimeSelectorText}>{formatTimeLabel(day.end_time)}</Text>
                      <Text style={styles.dayTimeSelectorHint}>⌄</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}

            <View style={styles.calendarOverrideCard}>
              <Text style={styles.calendarOverrideTitle}>Calendar availability</Text>
              <Text style={styles.calendarOverrideText}>
                Tap one or more dates, then mark all selected dates available or unavailable. Available dates use the matching weekday hours above.
              </Text>

              <View style={styles.calendarHeader}>
                <Pressable
                  accessibilityLabel="Previous month"
                  onPress={() => setAvailabilityCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  style={styles.monthButton}
                >
                  <Text style={styles.monthButtonText}>‹</Text>
                </Pressable>
                <Text style={styles.monthTitle}>
                  {monthNames[availabilityCalendarMonth.getMonth()]} {availabilityCalendarMonth.getFullYear()}
                </Text>
                <Pressable
                  accessibilityLabel="Next month"
                  onPress={() => setAvailabilityCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  style={styles.monthButton}
                >
                  <Text style={styles.monthButtonText}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekdayRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                  <Text key={`${day}-${index}`} style={styles.weekdayLabel}>{day}</Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {datesInCalendarMonth(availabilityCalendarMonth).map((date) => {
                  const key = dateKey(date);
                  const inCurrentMonth = date.getMonth() === availabilityCalendarMonth.getMonth();
                  const selected = selectedCalendarDates.includes(key);
                  const isOpen = getCalendarDateOpen(date);
                  const isPast = startOfDay(date).getTime() < startOfDay(new Date()).getTime();

                  return (
                    <Pressable
                      accessibilityLabel={`${date.toDateString()} ${isPast ? 'past and unavailable' : isOpen ? 'available' : 'unavailable'}`}
                      accessibilityRole="button"
                      key={key}
                      disabled={!inCurrentMonth || isPast}
                      onPress={() => toggleCalendarDateSelection(date)}
                      style={[
                        styles.calendarDay,
                        isOpen ? styles.calendarDayAvailable : styles.calendarDayUnavailable,
                        selected && styles.calendarDaySelected,
                        isPast && styles.calendarDayPast,
                        !inCurrentMonth && styles.calendarDayOutsideMonth,
                      ]}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        !isOpen && styles.calendarDayTextUnavailable,
                        selected && styles.calendarDayTextSelected,
                        isPast && styles.calendarDayTextPast,
                      ]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.calendarSelectionText}>
                {selectedCalendarDates.length === 0
                  ? 'Select one or more dates.'
                  : `${selectedCalendarDates.length} date${selectedCalendarDates.length === 1 ? '' : 's'} selected`}
              </Text>

              <View style={styles.calendarActions}>
                <Pressable
                  disabled={selectedCalendarDates.length === 0}
                  onPress={() => setSelectedCalendarDatesAvailability(true)}
                  style={[styles.markAvailableButton, selectedCalendarDates.length === 0 && styles.disabled]}
                >
                  <Text style={styles.markAvailableButtonText}>Mark Available</Text>
                </Pressable>
                <Pressable
                  disabled={selectedCalendarDates.length === 0}
                  onPress={() => setSelectedCalendarDatesAvailability(false)}
                  style={[styles.markUnavailableButton, selectedCalendarDates.length === 0 && styles.disabled]}
                >
                  <Text style={styles.markUnavailableButtonText}>Mark Unavailable</Text>
                </Pressable>
              </View>
            </View>
          </Section>

          <View style={styles.bottomNotice}>
            <Text style={styles.bottomNoticeTitle}>
              {property.approval_status === 'approved'
                ? 'Listing approved'
                : property.approval_status === 'pending'
                  ? 'Submitted for review'
                  : property.approval_status === 'declined'
                    ? 'Changes requested'
                    : 'Ready for review'}
            </Text>
            <Text style={styles.bottomNoticeText}>
              {property.approval_status === 'approved'
                ? 'Your site is live. You can save changes to its write-up and details without sending it through review again.'
                : property.approval_status === 'pending'
                  ? 'Your site is waiting for K9 Country administrator review. The review submission is locked until an administrator responds.'
                  : 'Save your finished listing to submit it for K9 Country administrator review. It will appear in guest search only after approval.'}
            </Text>
            {property.approval_status === 'approved' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={isPublishing || !hasUnsavedChanges}
                  onPress={() => void saveListing(false)}
                  style={[styles.publishButton, (isPublishing || !hasUnsavedChanges) && styles.disabled]}
                >
                  {isPublishing ? <ActivityIndicator color="#FFFDF8" /> : <Text style={styles.publishButtonText}>Save Changes</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.reviewCompleteButton}>
                  <Text style={styles.reviewCompleteButtonText}>Approved</Text>
                </Pressable>
              </>
            ) : <>
              {property.approval_status !== 'pending' ? <Pressable
                accessibilityRole="button"
                disabled={isPublishing || !hasUnsavedChanges}
                onPress={() => void saveListing(false)}
                style={[styles.saveDraftButton, (isPublishing || !hasUnsavedChanges) && styles.disabled]}
              >
                {isPublishing ? <ActivityIndicator color={colors.forest} /> : <Text style={styles.saveDraftButtonText}>Save Draft</Text>}
              </Pressable> : null}
              <Pressable
                accessibilityRole="button"
                disabled={isPublishing || property.approval_status === 'pending'}
                onPress={() => void saveListing(true)}
                style={[styles.publishButton, (isPublishing || property.approval_status === 'pending') && styles.disabled]}
              >
                {isPublishing ? (
                  <ActivityIndicator color="#FFFDF8" />
                ) : (
                  <Text style={styles.publishButtonText}>
                    {property.approval_status === 'pending'
                      ? 'Submitted for Review'
                      : property.approval_status === 'declined'
                        ? 'Resubmit for Review'
                        : 'Submit for Review'}
                  </Text>
                )}
              </Pressable>
            </>}
          </View>

          <View style={styles.deleteNotice}>
            <Text style={styles.deleteNoticeTitle}>Remove this listing</Text>
            <Text style={styles.deleteNoticeText}>
              Deleting removes this property, its details, and its photos from K9 Country.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={deleteListing}
              style={[styles.deleteButton, isDeleting && styles.disabled]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#B42318" />
              ) : (
                <Text style={styles.deleteButtonText}>Delete Listing</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.temporaryClosureNotice}>
            <View style={styles.temporaryClosureText}>
              <Text style={styles.temporaryClosureTitle}>Temporarily closed</Text>
              <Text style={styles.temporaryClosureDescription}>
                Keep the listing visible, but stop guests from making new reservations until you reopen it.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Temporarily close this property"
              onValueChange={(is_temporarily_closed) => {
                setProperty((current) =>
                  current ? { ...current, is_temporarily_closed } : current
                );
                setHasUnsavedChanges(true);
              }}
              thumbColor="#FFFDF8"
              trackColor={{ false: '#B8B3A8', true: '#A7463B' }}
              value={property.is_temporarily_closed}
            />
          </View>
        </ScrollView>

        <Modal
          animationType="slide"
          onRequestClose={() => setTimePickerTarget(null)}
          transparent
          visible={timePickerTarget !== null}
        >
          <Pressable onPress={() => setTimePickerTarget(null)} style={styles.modalBackdrop}>
            <Pressable onPress={() => undefined} style={styles.slotSheet}>
              <Text style={styles.slotSheetTitle}>
                {timePickerTarget?.kind.endsWith('start') ? 'Choose an opening time' : 'Choose a closing time'}
              </Text>
              <Text style={styles.slotSheetText}>Choose from 30-minute time options.</Text>
              <ScrollView contentContainerStyle={styles.slotList} showsVerticalScrollIndicator={false}>
                {halfHourTimes.map((time) => (
                  <Pressable key={time} onPress={() => chooseTime(time)} style={styles.slotButton}>
                    <Text style={styles.slotButtonText}>{formatTimeLabel(time)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable onPress={() => setTimePickerTarget(null)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, subtitle, children, requiredForReview = false }: { title: string; subtitle: string; icon: string; children: React.ReactNode; requiredForReview?: boolean }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{requiredForReview ? <Text style={styles.sectionRequiredText}>Required to submit for review</Text> : null}<Text style={styles.sectionSubtitle}>{subtitle}</Text><View style={styles.sectionContent}>{children}</View></View>;
}

function DraftField({ label, value, onChangeText, placeholder, multiline = false, requiredForReview = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; requiredForReview?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{requiredForReview ? <Text style={styles.reviewRequiredText}>Required to submit for review</Text> : null}<TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8A877D" multiline={multiline} numberOfLines={multiline ? 4 : 1} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.multilineInput]} /></View>;
}

function normalizeTime(time: string) {
  return time.slice(0, 5);
}

function formatTimeLabel(time: string) {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number);

  if (hours === 12 && minutes === 0) {
    return 'Noon';
  }

  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'a.m.' : 'p.m.'}`;
}

function LoadingState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return <SafeAreaView style={styles.safeArea}><View style={styles.loading}><Text style={styles.loadingText}>{message}</Text>{onAction && actionLabel ? <Pressable onPress={onAction} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{actionLabel}</Text></Pressable> : <ActivityIndicator color="#263A24" size="large" />}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  container: { padding: 20, paddingBottom: 42 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28 },
  loadingText: { color: colors.forest, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 10 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 20 },
  section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginBottom: 16, padding: 18 },
  sectionTitle: { color: colors.forest, fontSize: 21, fontWeight: '900' },
  sectionRequiredText: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, marginTop: 5 },
  sectionSubtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  sectionContent: { marginTop: 18 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  imageTile: { width: '47%' },
  photoPreview: { height: 98, overflow: 'hidden' },
  image: { borderRadius: 12, height: '100%', width: '100%' },
  imageFallback: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 12, height: '100%', justifyContent: 'center' },
  photoActions: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between', marginTop: 6 },
  primaryPhotoBadge: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 6 },
  primaryPhotoBadgeText: { color: colors.forest, fontSize: 10, fontWeight: '900' },
  primaryPhotoButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 6 },
  primaryPhotoButtonText: { color: colors.warmWhite, fontSize: 10, fontWeight: '900' },
  removePhoto: { alignItems: 'center', borderColor: '#B42318', borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 7 },
  removePhotoText: { color: '#B42318', fontSize: 10, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 13, borderWidth: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  field: { marginBottom: 15 },
  label: { color: colors.forest, fontSize: 14, fontWeight: '800', marginBottom: 7 },
  reviewRequiredText: { color: colors.brown, fontSize: 12, fontWeight: '800', marginBottom: 7, marginTop: -3 },
  input: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.forest, fontSize: 15, minHeight: 52, paddingHorizontal: 14 },
  multilineInput: { minHeight: 200, paddingTop: 13 },
  disabled: { opacity: 0.6 },
  amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  amenity: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, width: '48%' },
  amenitySelected: { backgroundColor: colors.lightGreen, borderColor: colors.forest },
  amenityIcon: { color: colors.brown, fontSize: 13, fontWeight: '900' },
  amenityText: { color: colors.forest, fontSize: 13, fontWeight: '700', marginLeft: 6, textAlign: 'center' },
  amenityTextSelected: { fontWeight: '900' },
  quickHoursCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 15, borderWidth: 1, marginBottom: 16, padding: 14 },
  quickHoursTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  quickHoursText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  templateTimeRow: { flexDirection: 'row', gap: 10, marginTop: 13 },
  templateTimeField: { flex: 1 },
  templateTimeLabel: { color: colors.forest, fontSize: 12, fontWeight: '900', marginBottom: 5 },
  timeSelector: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 10 },
  timeSelectorText: { color: colors.forest, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '900' },
  timeSelectorHint: { color: colors.brown, fontSize: 18, fontWeight: '900' },
  dayPickerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dayPickerButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  dayPickerButtonClosed: { backgroundColor: '#F0C5C0', borderColor: '#D88A80' },
  dayPickerButtonOpen: { backgroundColor: '#BFD8B9', borderColor: '#7DA879' },
  dayPickerText: { color: colors.forest, fontSize: 12, fontWeight: '900' },
  dayPickerTextClosed: { color: '#95423A' },
  applyHoursButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 11, justifyContent: 'center', marginTop: 14, minHeight: 44 },
  applyHoursButtonText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' },
  scheduleRow: { borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 12 },
  scheduleDayCell: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  scheduleDay: { color: colors.forest, flexShrink: 1, fontSize: 16, fontWeight: '900', paddingRight: 8 },
  dayTimeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' },
  dayTimeSelector: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 6, width: 100 },
  dayTimeSelectorText: { color: colors.forest, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '900' },
  dayTimeSelectorHint: { color: colors.brown, fontSize: 16, fontWeight: '900' },
  dayTimeSeparator: { color: colors.muted, fontSize: 12, fontWeight: '800', marginHorizontal: 4 },
  calendarOverrideCard: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 16, padding: 14 },
  calendarOverrideTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  calendarOverrideText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  calendarHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  monthButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  monthButtonText: { color: colors.forest, fontSize: 26, fontWeight: '700', lineHeight: 28 },
  monthTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  weekdayRow: { flexDirection: 'row', marginTop: 12 },
  weekdayLabel: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 6, rowGap: 5 },
  calendarDay: { alignItems: 'center', borderRadius: 16, height: 34, justifyContent: 'center', width: '13.2%' },
  calendarDayAvailable: { backgroundColor: '#BFD8B9' },
  calendarDayUnavailable: { backgroundColor: '#F0C5C0' },
  calendarDaySelected: { backgroundColor: colors.forest, borderColor: colors.warmWhite, borderWidth: 2 },
  calendarDayPast: { backgroundColor: '#F0C5C0', borderColor: '#D88A80', borderWidth: 1, opacity: 0.82 },
  calendarDayOutsideMonth: { opacity: 0.35 },
  calendarDayText: { color: colors.forest, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900' },
  calendarDayTextUnavailable: { color: '#95423A' },
  calendarDayTextSelected: { color: colors.warmWhite },
  calendarDayTextPast: { color: '#95423A' },
  calendarSelectionText: { color: colors.forest, fontSize: 13, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  calendarActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  markAvailableButton: { alignItems: 'center', backgroundColor: '#BFD8B9', borderColor: '#7DA879', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  markAvailableButtonText: { color: '#2D6A34', fontSize: 12, fontWeight: '900' },
  markUnavailableButton: { alignItems: 'center', backgroundColor: '#F0C5C0', borderColor: '#D88A80', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  markUnavailableButtonText: { color: '#95423A', fontSize: 12, fontWeight: '900' },
  modalBackdrop: { backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'flex-end' },
  slotSheet: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%', padding: 22 },
  slotSheetTitle: { color: colors.forest, fontSize: 22, fontWeight: '900' },
  slotSheetText: { color: colors.muted, fontSize: 14, marginTop: 5 },
  slotList: { gap: 9, paddingBottom: 12, paddingTop: 18 },
  slotButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  slotButtonText: { color: colors.forest, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' },
  cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  cancelButtonText: { color: colors.brown, fontSize: 16, fontWeight: '900' },
  bottomNotice: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 16, borderWidth: 1, marginTop: 4, padding: 16 },
  bottomNoticeTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  bottomNoticeText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  saveDraftButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.forest, borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 52 },
  saveDraftButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  publishButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 13, justifyContent: 'center', marginTop: 16, minHeight: 52 },
  publishButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  reviewCompleteButton: { alignItems: 'center', backgroundColor: '#D7D3CA', borderRadius: 13, justifyContent: 'center', marginTop: 10, minHeight: 48 },
  reviewCompleteButtonText: { color: '#6D6A63', fontSize: 15, fontWeight: '900' },
  temporaryClosureNotice: { alignItems: 'center', backgroundColor: '#FFF4E7', borderColor: '#E2B37A', borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 16, padding: 16 },
  temporaryClosureText: { flex: 1, paddingRight: 14 },
  temporaryClosureTitle: { color: '#8A4F17', fontSize: 16, fontWeight: '900' },
  temporaryClosureDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  deleteNotice: { backgroundColor: '#FDF0EE', borderColor: '#F0B8B0', borderRadius: 16, borderWidth: 1, marginTop: 26, padding: 16 },
  deleteNoticeTitle: { color: '#B42318', fontSize: 16, fontWeight: '900' },
  deleteNoticeText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  deleteButton: { alignItems: 'center', borderColor: '#B42318', borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 15, minHeight: 50 },
  deleteButtonText: { color: '#B42318', fontSize: 15, fontWeight: '900' },
});
