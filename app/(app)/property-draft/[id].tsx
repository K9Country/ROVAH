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
import { propertyTimeZones, type PropertyTimeZone } from '../../../constants/property-time-zones';
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
type PropertyBasicsDraft = {
  name: string;
  shortDescription: string;
  siteAddress: string;
  city: string;
  state: string;
  postalCode: string;
  pricePerHour: string;
  acreage: string;
  isFullyFenced: boolean;
  fenceHeightFeet: string;
  timeZone: PropertyTimeZone;
};

const defaultSchedule = (): DaySchedule[] =>
  dayNames.map((_, day_of_week) => ({
    day_of_week,
    start_time: '08:00',
    end_time: '17:00',
    enabled: false,
  }));

const propertyBasicsFrom = (property: Property): PropertyBasicsDraft => ({
  name: property.name,
  shortDescription: property.short_description,
  siteAddress: property.site_address,
  city: property.city,
  state: property.state,
  postalCode: property.postal_code,
  pricePerHour: String(property.price_per_hour),
  acreage: property.acreage === null ? '' : String(property.acreage),
  isFullyFenced: property.is_fully_fenced,
  fenceHeightFeet: property.fence_height_feet === null ? '' : String(property.fence_height_feet),
  timeZone: property.time_zone as PropertyTimeZone,
});

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

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
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
  const [templateStartDate, setTemplateStartDate] = useState('');
  const [templateEndDate, setTemplateEndDate] = useState('');
  const [selectedScheduleDays, setSelectedScheduleDays] = useState<number[]>([]);
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget>(null);
  const [dateAvailability, setDateAvailability] = useState<DateAvailabilityOverride[]>([]);
  const [propertyBasics, setPropertyBasics] = useState<PropertyBasicsDraft | null>(null);
  const [availabilityCalendarMonth, setAvailabilityCalendarMonth] = useState(() => startOfDay(new Date()));
  const [selectedCalendarDates, setSelectedCalendarDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [primaryImageId, setPrimaryImageId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isResendingReviewEmail, setIsResendingReviewEmail] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false);
  const [deletedSiteName, setDeletedSiteName] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
        supabase.from('property_availability').select('day_of_week, start_time, end_time, starts_on, ends_on').eq('property_id', id),
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

    const loadedProperty = propertyResult.data as Property | null;
    setProperty(loadedProperty);
    setPropertyBasics(loadedProperty ? propertyBasicsFrom(loadedProperty) : null);
    if (detailsResult.data) setDetails(detailsResult.data as PropertyDraftDetails);
    setSelectedAmenities((amenitiesResult.data ?? []).map((item) => item.amenity_code));
    setDateAvailability((dateAvailabilityResult.data ?? []) as DateAvailabilityOverride[]);
    const savedAvailability = (availabilityResult.data ?? []) as PropertyAvailability[];
      if (savedAvailability[0]) {
        setTemplateStartTime(normalizeTime(savedAvailability[0].start_time));
        setTemplateEndTime(normalizeTime(savedAvailability[0].end_time));
        setTemplateStartDate(savedAvailability[0].starts_on ?? '');
        setTemplateEndDate(savedAvailability[0].ends_on ?? '');
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

    const startsOn = templateStartDate.trim();
    const endsOn = templateEndDate.trim();

    if ((startsOn && !endsOn) || (!startsOn && endsOn)) {
      Alert.alert('Add both dates', 'Enter both a beginning date and an ending date, or leave both blank for an ongoing schedule.');
      return;
    }

    if ((startsOn && !isValidDateInput(startsOn)) || (endsOn && !isValidDateInput(endsOn))) {
      Alert.alert('Check the dates', 'Use the YYYY-MM-DD format for the beginning and ending dates.');
      return;
    }

    if (startsOn && endsOn && startsOn > endsOn) {
      Alert.alert('Check the date range', 'The beginning date must be on or before the ending date.');
      return;
    }

    const nextSchedule = schedule.map((day) =>
      selectedScheduleDays.includes(day.day_of_week)
        ? {
            ...day,
            enabled: true,
            start_time: templateStartTime,
            end_time: templateEndTime,
            starts_on: startsOn || null,
            ends_on: endsOn || null,
          }
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
    const weeklySchedule = schedule.find((item) => item.day_of_week === date.getDay());
    const key = dateKey(date);
    return Boolean(
      weeklySchedule?.enabled &&
        (!weeklySchedule.starts_on || key >= weeklySchedule.starts_on) &&
        (!weeklySchedule.ends_on || key <= weeklySchedule.ends_on),
    );
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
    if (!id || !property || !propertyBasics || !session?.user.id) return;
    const wasPublished = property.is_published;
    const hourlyRate = Number(propertyBasics.pricePerHour);
    const acreage = propertyBasics.acreage.trim() ? Number(propertyBasics.acreage) : null;
    const fenceHeight = propertyBasics.fenceHeightFeet.trim() ? Number(propertyBasics.fenceHeightFeet) : null;
    const openDays = scheduleToSave.filter((day) => day.enabled);
    const invalidDay = openDays.find(
      (day) =>
        !/^\d{2}:\d{2}$/.test(day.start_time) ||
        !/^\d{2}:\d{2}$/.test(day.end_time) ||
        day.start_time >= day.end_time
    );
    if (propertyBasics.name.trim().length < 3 || propertyBasics.shortDescription.trim().length < 20 || !propertyBasics.siteAddress.trim() || !propertyBasics.city.trim() || propertyBasics.state.trim().length !== 2 || !propertyBasics.postalCode.trim() || !propertyBasics.timeZone || !Number.isFinite(hourlyRate) || hourlyRate <= 0 || acreage === null || !Number.isFinite(acreage) || acreage < 0 || (propertyBasics.isFullyFenced && (fenceHeight === null || !Number.isFinite(fenceHeight) || fenceHeight <= 0))) {
      Alert.alert('Complete property basics', 'Add a property name, description, full address, a valid hourly rate, and valid acreage or fence details before saving.');
      return;
    }

    if (submitForReview && images.length === 0) {
      Alert.alert('Add a property photo', 'Upload at least one photo before publishing your listing.');
      return;
    }

    if (submitForReview && !propertyBasics.siteAddress.trim()) {
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
            openDays.map(({ day_of_week, start_time, end_time, starts_on, ends_on }) => ({
              property_id: id,
              day_of_week,
              start_time,
              end_time,
              starts_on: starts_on ?? null,
              ends_on: ends_on ?? null,
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
          name: propertyBasics.name.trim(),
          short_description: propertyBasics.shortDescription.trim(),
          site_address: propertyBasics.siteAddress.trim(),
          city: propertyBasics.city.trim(),
          state: propertyBasics.state.trim().toUpperCase(),
          postal_code: propertyBasics.postalCode.trim(),
          price_per_hour: hourlyRate,
          acreage,
          is_fully_fenced: propertyBasics.isFullyFenced,
          fence_height_feet: propertyBasics.isFullyFenced ? fenceHeight : null,
          time_zone: propertyBasics.timeZone,
          is_published: submitForReview ? false : property.is_published,
          approval_status: submitForReview ? 'pending' : property.approval_status,
          hero_image_url: primaryPhoto?.storage_path ?? property.hero_image_url,
          is_temporarily_closed: property.is_temporarily_closed,
        })
        .eq('id', id)
        .eq('host_id', session.user.id);
      if (publishError) throw publishError;

      const { data: locationData, error: locationError } = await supabase.functions.invoke('sync-site-promotion-location', {
        body: { propertyId: id },
      });
      if (locationError || locationData?.error) {
        console.warn('Saved property address could not yet be prepared for promotions', locationError?.message ?? locationData?.error);
      }

      if (submitForReview) {
        const { error: notificationError } = await supabase.functions.invoke('notify-admin-of-site-submission', {
          body: { propertyId: id },
        });
        // A site remains submitted even if the administrator email service is temporarily unavailable.
        if (notificationError) console.warn('Administrator site-review notification could not be sent', notificationError.message);
      }

      setProperty((current) =>
        current
          ? {
              ...current,
              is_published: submitForReview ? false : current.is_published,
              approval_status: submitForReview ? 'pending' : current.approval_status,
              hero_image_url: primaryPhoto?.storage_path ?? current.hero_image_url,
              name: propertyBasics.name.trim(),
              short_description: propertyBasics.shortDescription.trim(),
              site_address: propertyBasics.siteAddress.trim(),
              city: propertyBasics.city.trim(),
              state: propertyBasics.state.trim().toUpperCase(),
              postal_code: propertyBasics.postalCode.trim(),
              price_per_hour: hourlyRate,
              acreage,
              is_fully_fenced: propertyBasics.isFullyFenced,
              fence_height_feet: propertyBasics.isFullyFenced ? fenceHeight : null,
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

  async function resendReviewEmail() {
    if (!id || !property || property.approval_status !== 'pending' || isResendingReviewEmail) return;

    try {
      setIsResendingReviewEmail(true);
      const { data, error } = await supabase.functions.invoke('notify-admin-of-site-submission', {
        body: { propertyId: id },
      });
      if (error) throw error;
      if (!data?.sent) throw new Error('The review email could not be sent. Please try again.');

      Alert.alert('Review email sent', 'A new review notice was sent to the ROVAH administrator. Your site remains pending review.');
    } catch (error) {
      Alert.alert(
        'Unable to resend review email',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsResendingReviewEmail(false);
    }
  }

  const deleteListing = () => {
    if (!id || !property || !session?.user.id || isDeleting) return;
    setDeleteError(null);
    setDeleteConfirmationVisible(true);
  };

  const confirmDeleteListing = async () => {
    if (!id || !session?.user.id || isDeleting) return;

    try {
      setIsDeleting(true);
      const { data, error } = await supabase.functions.invoke('delete-host-property', {
        body: { propertyId: id },
      });
      if (error) {
        const response = 'context' in error && error.context instanceof Response ? error.context : null;
        const failure = response ? await response.json().catch(() => null) as { error?: string } | null : null;
        throw new Error(failure?.error ?? error.message);
      }
      if (!data?.deleted) throw new Error(data?.error ?? 'We could not delete this site. Please try again.');
      setDeleteConfirmationVisible(false);
      setDeletedSiteName(data.siteName ?? 'Your site');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading property details..." />;
  }

  if (!property || !propertyBasics) {
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
          <Text style={styles.title}>{propertyBasics.name}</Text>
          <Text style={styles.description}>Complete these details so guests know exactly what to expect before they arrive.</Text>

          <Section title="Property Basics" subtitle="Your listing name, location, hourly rate, and core property details" icon="Property" requiredForReview>
            <DraftField label="Property name" value={propertyBasics.name} onChangeText={(name) => { setPropertyBasics((current) => current ? { ...current, name } : current); setHasUnsavedChanges(true); }} placeholder="Example: Mission Field" requiredForReview />
            <DraftField label="Short description" value={propertyBasics.shortDescription} onChangeText={(shortDescription) => { setPropertyBasics((current) => current ? { ...current, shortDescription } : current); setHasUnsavedChanges(true); }} placeholder="Tell guests what makes this private space special." requiredForReview multiline />
            <DraftField label="Street address" value={propertyBasics.siteAddress} onChangeText={(siteAddress) => { setPropertyBasics((current) => current ? { ...current, siteAddress } : current); setHasUnsavedChanges(true); }} placeholder="123 Country Lane" requiredForReview />
            <View style={styles.propertyBasicsRow}>
              <View style={styles.propertyBasicsWideField}><DraftField label="City" value={propertyBasics.city} onChangeText={(city) => { setPropertyBasics((current) => current ? { ...current, city } : current); setHasUnsavedChanges(true); }} placeholder="City" requiredForReview /></View>
              <View style={styles.propertyBasicsNarrowField}><DraftField label="State" value={propertyBasics.state} onChangeText={(state) => { setPropertyBasics((current) => current ? { ...current, state: state.toUpperCase() } : current); setHasUnsavedChanges(true); }} placeholder="MI" requiredForReview maxLength={2} /></View>
            </View>
            <DraftField label="ZIP or postal code" value={propertyBasics.postalCode} onChangeText={(postalCode) => { setPropertyBasics((current) => current ? { ...current, postalCode } : current); setHasUnsavedChanges(true); }} placeholder="ZIP or postal code" requiredForReview />
            <Text style={styles.propertyToggleTitle}>Site time zone</Text>
            <Text style={styles.propertyToggleText}>Required. Guests use this time zone for reservation times and subscription expiration.</Text>
            <View style={styles.timeZoneChoices}>{propertyTimeZones.map((option) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: propertyBasics.timeZone === option.value }} key={option.value} onPress={() => { setPropertyBasics((current) => current ? { ...current, timeZone: option.value } : current); setHasUnsavedChanges(true); }} style={[styles.timeZoneChoice, propertyBasics.timeZone === option.value && styles.timeZoneChoiceSelected]}><Text style={[styles.timeZoneChoiceText, propertyBasics.timeZone === option.value && styles.timeZoneChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
            <View style={styles.propertyBasicsRow}>
              <View style={styles.propertyBasicsWideField}><DraftField keyboardType="decimal-pad" label="Standard hourly rate" value={propertyBasics.pricePerHour} onChangeText={(pricePerHour) => { setPropertyBasics((current) => current ? { ...current, pricePerHour: pricePerHour.replace(/[^0-9.]/g, '') } : current); setHasUnsavedChanges(true); }} placeholder="$15" requiredForReview /></View>
              <View style={styles.propertyBasicsNarrowField}><DraftField keyboardType="decimal-pad" label="Acreage" value={propertyBasics.acreage} onChangeText={(acreage) => { setPropertyBasics((current) => current ? { ...current, acreage: acreage.replace(/[^0-9.]/g, '') } : current); setHasUnsavedChanges(true); }} placeholder="Example: 2" requiredForReview /></View>
            </View>
            <View style={styles.propertyToggleRow}><View style={styles.propertyToggleCopy}><Text style={styles.propertyToggleTitle}>Fully fenced</Text><Text style={styles.propertyToggleText}>Tell guests whether the entire space is enclosed.</Text></View><Switch accessibilityLabel="Property is fully fenced" onValueChange={(isFullyFenced) => { setPropertyBasics((current) => current ? { ...current, isFullyFenced } : current); setHasUnsavedChanges(true); }} thumbColor="#FFFDF8" trackColor={{ false: '#B8B3A8', true: '#6E996E' }} value={propertyBasics.isFullyFenced} /></View>
            {propertyBasics.isFullyFenced ? <DraftField keyboardType="decimal-pad" label="Fence height in feet" value={propertyBasics.fenceHeightFeet} onChangeText={(fenceHeightFeet) => { setPropertyBasics((current) => current ? { ...current, fenceHeightFeet: fenceHeightFeet.replace(/[^0-9.]/g, '') } : current); setHasUnsavedChanges(true); }} placeholder="Example: 6" requiredForReview /> : null}
          </Section>

          <Section title="Photos" subtitle={`${images.length} uploaded`} icon="Photos" requiredForReview>
            <View style={styles.photoGuidance}>
              <Text style={styles.photoGuidanceTitle}>Photos are required to publish</Text>
              <Text style={styles.photoGuidanceText}>More high-quality photos help guests picture their visit, build trust, and drive more bookings. Aim for at least 8 recent photos of the entrance, parking, play areas, fencing, and amenities.</Text>
            </View>
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
            subtitle="Set weekly hours for a selected date range, then use the calendar only for one-day exceptions."
            icon="Calendar"
          >
            <View style={styles.quickHoursCard}>
              <Text style={styles.quickHoursTitle}>Apply hours</Text>
              <Text style={styles.quickHoursText}>Choose the days you want to open, then set the hours and date range for this schedule.</Text>

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

              <View style={styles.scheduleRange}>
                <Text style={styles.scheduleRangeTitle}>Schedule date range</Text>
                <Text style={styles.scheduleRangeHint}>
                  Choose when these weekly hours begin and end. Leave both dates blank to keep this schedule ongoing.
                </Text>
                <View style={styles.scheduleRangeFields}>
                  <View style={styles.scheduleRangeField}>
                    <Text style={styles.templateTimeLabel}>Beginning date</Text>
                    <TextInput
                      accessibilityLabel="Schedule beginning date"
                      autoCapitalize="none"
                      maxLength={10}
                      onChangeText={setTemplateStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.muted}
                      style={styles.scheduleRangeInput}
                      value={templateStartDate}
                    />
                  </View>
                  <View style={styles.scheduleRangeField}>
                    <Text style={styles.templateTimeLabel}>Ending date</Text>
                    <TextInput
                      accessibilityLabel="Schedule ending date"
                      autoCapitalize="none"
                      maxLength={10}
                      onChangeText={setTemplateEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.muted}
                      style={styles.scheduleRangeInput}
                      value={templateEndDate}
                    />
                  </View>
                </View>
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
                  ? 'Your site is waiting for ROVAH administrator review. The review submission is locked until an administrator responds.'
                  : 'Save your finished listing to submit it for ROVAH administrator review. It will appear in guest search only after approval.'}
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
              {property.approval_status === 'pending' ? <Pressable
                accessibilityRole="button"
                disabled={isResendingReviewEmail}
                onPress={() => void resendReviewEmail()}
                style={[styles.saveDraftButton, isResendingReviewEmail && styles.disabled]}
              >
                {isResendingReviewEmail ? <ActivityIndicator color={colors.forest} /> : <Text style={styles.saveDraftButtonText}>Resend Review Email</Text>}
              </Pressable> : null}
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
              Deleting removes this property, its details, and its photos from ROVAH.
            </Text>
            {deleteError ? <Text accessibilityLiveRegion="polite" style={styles.deleteError}>{deleteError}</Text> : null}
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

          <View style={styles.listingGuide}>
            <Text style={styles.listingGuideTitle}>How to use Property Details</Text>
            <Text style={styles.listingGuideIntro}>Complete the site details, save as you go, then submit when the listing is ready for ROVAH review.</Text>

            <ListingGuideStep number="1" title="Add the basics" text="Enter the name, description, address, rate, acreage, and fence details. Members use this information to understand the site." />
            <ListingGuideStep number="2" title="Upload site photos" text="Add at least one clear photo of the actual space. Photos are required before review." />
            <ListingGuideStep number="3" title="Complete arrival details" text="Add parking and gate access, property rules, and every available amenity so guests know what to expect." />
            <ListingGuideStep number="4" title="Set availability" text="Choose weekly days and hours, add a beginning and ending date for a seasonal schedule, then select Apply & Save Hours. Leave both dates blank for ongoing availability; use the calendar only for one-day exceptions." />
            <ListingGuideStep number="5" title="Choose the next action after approval" text="Use Reservations for visits, Messages for guest communication, and Grow Your Site to manage subscriptions, promotion, and listing updates." />
            <ListingGuideStep number="6" title="Save, then submit" text="Save Draft keeps work private while you edit. Submit for Review sends the finished listing to ROVAH; members cannot reserve it until approval." />
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

        <Modal
          animationType="fade"
          onRequestClose={() => !isDeleting && setDeleteConfirmationVisible(false)}
          transparent
          visible={deleteConfirmationVisible}
        >
          <View style={styles.deleteConfirmBackdrop}>
            <View accessibilityViewIsModal style={styles.deleteConfirmSheet}>
              <Text style={styles.deleteConfirmTitle}>Delete this listing?</Text>
              <Text style={styles.deleteConfirmText}>
                This permanently deletes {property.name}, including its details and photos. This cannot be undone.
              </Text>
              <View style={styles.deleteConfirmActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={() => setDeleteConfirmationVisible(false)}
                  style={[styles.deleteConfirmCancel, isDeleting && styles.disabled]}
                >
                  <Text style={styles.deleteConfirmCancelText}>Keep Listing</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={() => void confirmDeleteListing()}
                  style={[styles.deleteConfirmButton, isDeleting && styles.disabled]}
                >
                  {isDeleting ? <ActivityIndicator color="#FFFDF8" /> : <Text style={styles.deleteConfirmButtonText}>Delete Listing</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          onRequestClose={() => setDeletedSiteName(null)}
          transparent
          visible={deletedSiteName !== null}
        >
          <View style={styles.deleteConfirmBackdrop}>
            <View accessibilityViewIsModal style={styles.deleteConfirmSheet}>
              <Text style={styles.deleteSuccessTitle}>Site deleted</Text>
              <Text style={styles.deleteConfirmText}>{deletedSiteName} was permanently removed.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDeletedSiteName(null);
                  router.replace('/host-dashboard');
                }}
                style={styles.deleteSuccessButton}
              >
                <Text style={styles.deleteSuccessButtonText}>Return to Host Dashboard</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, subtitle, children, requiredForReview = false }: { title: string; subtitle: string; icon: string; children: React.ReactNode; requiredForReview?: boolean }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{requiredForReview ? <Text style={styles.sectionRequiredText}>Required to submit for review</Text> : null}<Text style={styles.sectionSubtitle}>{subtitle}</Text><View style={styles.sectionContent}>{children}</View></View>;
}

function DraftField({ label, value, onChangeText, placeholder, multiline = false, requiredForReview = false, keyboardType = 'default', maxLength, suffix }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; requiredForReview?: boolean; keyboardType?: 'default' | 'number-pad' | 'decimal-pad'; maxLength?: number; suffix?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{requiredForReview ? <Text style={styles.reviewRequiredText}>Required</Text> : null}<View style={suffix ? styles.inputWithSuffix : undefined}><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8A877D" keyboardType={keyboardType} maxLength={maxLength} multiline={multiline} numberOfLines={multiline ? 4 : 1} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, suffix && styles.inputWithSuffixField, multiline && styles.multilineInput]} />{suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}</View></View>;
}

function ListingGuideStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <View style={styles.listingGuideStep}><Text style={styles.listingGuideNumber}>{number}</Text><View style={styles.listingGuideCopy}><Text style={styles.listingGuideStepTitle}>{title}</Text><Text style={styles.listingGuideStepText}>{text}</Text></View></View>;
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
  photoGuidance: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 13 },
  photoGuidanceTitle: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  photoGuidanceText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
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
  inputWithSuffix: { position: 'relative', width: '100%' },
  inputWithSuffixField: { paddingRight: 42, width: '100%' },
  inputSuffix: { color: colors.forest, fontSize: 17, fontWeight: '900', position: 'absolute', right: 14, top: 15 },
  multilineInput: { minHeight: 200, paddingTop: 13 },
  propertyBasicsRow: { flexDirection: 'row', gap: 10 },
  propertyBasicsWideField: { flex: 1.55 },
  propertyBasicsNarrowField: { flex: 1 },
  propertyToggleRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingTop: 16, paddingBottom: 15 },
  propertyToggleCopy: { flex: 1, paddingRight: 14 },
  propertyToggleTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  propertyToggleText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  timeZoneChoices: { gap: 8, marginTop: 12 },
  timeZoneChoice: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 13 },
  timeZoneChoiceSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  timeZoneChoiceText: { color: colors.forest, fontSize: 14, fontWeight: '800' },
  timeZoneChoiceTextSelected: { color: colors.warmWhite },
  loyaltyToggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  loyaltyToggleCopy: { flex: 1, paddingRight: 14 },
  loyaltyToggleTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  loyaltyToggleText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  loyaltySetup: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 18, paddingTop: 18 },
  loyaltyFieldRow: { flexDirection: 'row', gap: 10 },
  loyaltyField: { flex: 1, minWidth: 0 },
  loyaltyFieldHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: -5 },
  loyaltyMathCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 15, borderWidth: 1, marginTop: 16, padding: 14 },
  loyaltyMathTitle: { color: colors.forest, fontSize: 15, fontWeight: '900', marginBottom: 8 },
  loyaltyMathRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  loyaltyMathRowEmphasis: { borderTopColor: '#AFC6A6', borderTopWidth: 1, marginTop: 4, paddingTop: 11 },
  loyaltyMathLabel: { color: colors.muted, flex: 1, fontSize: 13, paddingRight: 10 },
  loyaltyMathValue: { color: colors.forest, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900', textAlign: 'right' },
  loyaltyMathEmphasis: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  loyaltyPaymentNote: { color: colors.brown, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 12 },
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
  scheduleRange: { marginTop: 14 },
  scheduleRangeTitle: { color: colors.forest, fontSize: 13, fontWeight: '900' },
  scheduleRangeHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  scheduleRangeFields: { flexDirection: 'row', gap: 10, marginTop: 10 },
  scheduleRangeField: { flex: 1 },
  scheduleRangeInput: { backgroundColor: colors.warmWhite, borderColor: '#CBD1BD', borderRadius: 10, borderWidth: 1, color: colors.forest, fontSize: 14, minHeight: 44, paddingHorizontal: 10 },
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
  listingGuide: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 24, padding: 17 },
  listingGuideTitle: { color: colors.forest, fontSize: 19, fontWeight: '900' },
  listingGuideIntro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  listingGuideStep: { flexDirection: 'row', marginTop: 16 },
  listingGuideNumber: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 13, fontWeight: '900', height: 26, lineHeight: 24, marginRight: 10, textAlign: 'center', width: 26 },
  listingGuideCopy: { flex: 1 },
  listingGuideStepTitle: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  listingGuideStepText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  deleteNotice: { backgroundColor: '#FDF0EE', borderColor: '#F0B8B0', borderRadius: 16, borderWidth: 1, marginTop: 26, padding: 16 },
  deleteNoticeTitle: { color: '#B42318', fontSize: 16, fontWeight: '900' },
  deleteNoticeText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  deleteError: { color: '#B42318', fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 10 },
  deleteButton: { alignItems: 'center', borderColor: '#B42318', borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 15, minHeight: 50 },
  deleteButtonText: { color: '#B42318', fontSize: 15, fontWeight: '900' },
  deleteConfirmBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.48)', flex: 1, justifyContent: 'center', padding: 22 },
  deleteConfirmSheet: { backgroundColor: colors.warmWhite, borderColor: '#F0B8B0', borderRadius: 22, borderWidth: 1, maxWidth: 420, padding: 22, width: '100%' },
  deleteConfirmTitle: { color: '#B42318', fontSize: 22, fontWeight: '900' },
  deleteSuccessTitle: { color: colors.forest, fontSize: 22, fontWeight: '900' },
  deleteConfirmText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  deleteConfirmActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  deleteConfirmCancel: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 8 },
  deleteConfirmCancelText: { color: colors.forest, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  deleteConfirmButton: { alignItems: 'center', backgroundColor: '#B42318', borderRadius: 13, flex: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 8 },
  deleteConfirmButtonText: { color: '#FFFDF8', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  deleteSuccessButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 13, justifyContent: 'center', marginTop: 22, minHeight: 52, paddingHorizontal: 14 },
  deleteSuccessButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900', textAlign: 'center' },
});
