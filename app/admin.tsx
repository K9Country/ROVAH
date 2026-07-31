import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../services/auth-context';

type ApprovalStatus = 'pending' | 'approved' | 'declined';

type ReviewProperty = {
  id: string;
  host_id: string | null;
  name: string;
  short_description: string;
  city: string;
  state: string;
  site_address: string;
  price_per_hour: number;
  acreage: number | null;
  is_fully_fenced: boolean;
  fence_height_feet: number | null;
  instant_book: boolean;
  is_temporarily_closed: boolean;
  is_published: boolean;
  approval_status: ApprovalStatus;
  review_notes: string | null;
  created_at: string;
};

type HostSummary = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  home_address: string | null;
  home_city: string | null;
  home_state: string | null;
  home_postal_code: string | null;
  primary_site_address: string | null;
  primary_site_city: string | null;
  primary_site_state: string | null;
  primary_site_postal_code: string | null;
  controls_property: boolean;
  accepted_host_terms_at: string | null;
  onboarding_completed_at: string | null;
  identity_verification_status: string;
  profile_image_path: string | null;
};

type PropertyDraftDetails = {
  property_id: string;
  parking_instructions: string;
  gate_access_instructions: string;
  arrival_instructions: string;
  property_rules: string;
  availability_notes: string;
};

type PropertyImage = { id: string; property_id: string; storage_path: string; alt_text: string; display_order: number; is_cover: boolean; signedUrl?: string };
type PropertyReviewDetails = {
  details: PropertyDraftDetails | null;
  amenities: string[];
  images: PropertyImage[];
};

const amenityLabels: Record<string, string> = {
  water: 'Water bowl', shade: 'Shade', picnic_table: 'Picnic table', restroom: 'Restroom', parking: 'Parking', tennis_ball: 'Tennis ball', frisbee: 'Frisbee', agility_equipment: 'Agility equipment', swimming_pool: 'Swimming pool', agility_course: 'Agility course', hiking_trails: 'Hiking trails', lake_access: 'Lake access', poop_bags: '💩 Poop bags', wheelchair_accessible: 'Wheelchair accessible',
};

export default function AdministratorScreen() {
  const { session } = useAuth();
  const [properties, setProperties] = useState<ReviewProperty[]>([]);
  const [hosts, setHosts] = useState<Record<string, HostSummary>>({});
  const [reviewDetailsByProperty, setReviewDetailsByProperty] = useState<Record<string, PropertyReviewDetails>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalStatus | 'all'>('pending');
  const [notesByProperty, setNotesByProperty] = useState<Record<string, string>>({});
  const [savingPropertyId, setSavingPropertyId] = useState<string | null>(null);

  const loadReviewQueue = useCallback(async () => {
    if (!session?.user.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const { data: adminRecord, error: adminError } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (adminError || !adminRecord) {
      setIsAdministrator(false);
      setIsLoading(false);
      return;
    }

    setIsAdministrator(true);
    const [propertiesResult, hostsResult, detailsResult, amenitiesResult, imagesResult] = await Promise.all([
      supabase.from('properties').select('*').neq('approval_status', 'draft').order('created_at', { ascending: true }),
      supabase.from('host_profiles').select('user_id, full_name, email, phone, home_address, home_city, home_state, home_postal_code, primary_site_address, primary_site_city, primary_site_state, primary_site_postal_code, controls_property, accepted_host_terms_at, onboarding_completed_at, identity_verification_status, profile_image_path'),
      supabase.from('property_draft_details').select('property_id, parking_instructions, gate_access_instructions, arrival_instructions, property_rules, availability_notes'),
      supabase.from('property_amenities').select('property_id, amenity_code'),
      supabase.from('property_images').select('id, property_id, storage_path, alt_text, display_order, is_cover').order('display_order'),
    ]);

    const reviewDataError = [propertiesResult.error, hostsResult.error, detailsResult.error, amenitiesResult.error, imagesResult.error].find(Boolean);
    if (reviewDataError) {
      setErrorMessage(reviewDataError.message ?? 'Unable to load the review queue.');
      setIsLoading(false);
      return;
    }

    const nextProperties = (propertiesResult.data ?? []) as ReviewProperty[];
    const nextHosts = Object.fromEntries(
      ((hostsResult.data ?? []) as HostSummary[]).map((host) => [host.user_id, host])
    );
    setProperties(nextProperties);
    setHosts(nextHosts);
    const imageRows = (imagesResult.data ?? []) as PropertyImage[];
    const { data: signedImages, error: signedImageError } = imageRows.length
      ? await supabase.storage.from('property-images').createSignedUrls(imageRows.map((image) => image.storage_path), 3600)
      : { data: [], error: null };
    if (signedImageError) {
      setErrorMessage(signedImageError.message);
      setIsLoading(false);
      return;
    }
    const signedUrlByPath = new Map((signedImages ?? []).map((image) => [image.path, image.signedUrl]));
    const nextReviewDetails: Record<string, PropertyReviewDetails> = {};
    for (const property of nextProperties) {
      nextReviewDetails[property.id] = {
        details: ((detailsResult.data ?? []) as PropertyDraftDetails[]).find((detail) => detail.property_id === property.id) ?? null,
        amenities: ((amenitiesResult.data ?? []) as { property_id: string; amenity_code: string }[]).filter((item) => item.property_id === property.id).map((item) => item.amenity_code),
        images: imageRows.filter((image) => image.property_id === property.id).map((image) => ({ ...image, signedUrl: signedUrlByPath.get(image.storage_path) ?? undefined })),
      };
    }
    setReviewDetailsByProperty(nextReviewDetails);
    setNotesByProperty(Object.fromEntries(nextProperties.map((property) => [property.id, property.review_notes ?? ''])));
    setIsLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void loadReviewQueue();
  }, [loadReviewQueue]);

  const visibleProperties = useMemo(
    () => properties.filter((property) => filter === 'all' || property.approval_status === filter),
    [filter, properties]
  );

  const saveDecision = async (property: ReviewProperty, decision: Extract<ApprovalStatus, 'approved' | 'declined'>, action: string) => {
    try {
      setSavingPropertyId(property.id);
      const { error } = await supabase
        .from('properties')
        .update({
          approval_status: decision,
          is_published: decision === 'approved',
          review_notes: notesByProperty[property.id]?.trim() || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: session?.user.id,
        })
        .eq('id', property.id);

      if (error) throw error;

      setProperties((current) => current.map((item) => (
        item.id === property.id
          ? { ...item, approval_status: decision, is_published: decision === 'approved', review_notes: notesByProperty[property.id]?.trim() || null }
          : item
      )));
      Alert.alert('Site updated', `${property.name} was ${action}.`);
    } catch (error) {
      Alert.alert('Unable to update site', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingPropertyId(null);
    }
  };

  const openAdministratorSignIn = async () => {
    // A signed-in member or host must sign out before choosing the authorized
    // administrator account. This keeps the administrator area protected.
    if (session) {
      await supabase.auth.signOut();
    }
    router.replace('/admin-sign-in' as never);
  };

  if (isLoading) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} size="large" /><Text style={styles.loadingText}>Opening administrator area…</Text></View></SafeAreaView>;
  }

  if (!isAdministrator) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Administrator access only</Text>
          <Text style={styles.description}>
            Sign in with the ROVAH account that has been assigned administrator access.
          </Text>
          <Pressable onPress={() => void openAdministratorSignIn()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign in as administrator</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/forgot-password?intent=admin' as never)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>First time here? Set or reset password</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.returnButton}>
            <Text style={styles.returnButtonText}>Return to host area</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backText}>‹ Host area</Text></Pressable>
        <Text style={styles.eyebrow}>ROVAH ADMINISTRATOR</Text>
        <Text style={styles.title}>Site review queue</Text>
        <Text style={styles.description}>Review each site before it becomes visible to guests. Approval publishes it; declining hides it.</Text>

        <View style={styles.filterRow}>
          {(['pending', 'approved', 'declined', 'all'] as const).map((value) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filterButton, filter === value && styles.filterButtonSelected]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {visibleProperties.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No {filter === 'all' ? '' : filter} sites</Text><Text style={styles.emptyText}>New host listings will appear here when they are ready for your review.</Text></View> : null}

        {visibleProperties.map((property) => {
          const host = property.host_id ? hosts[property.host_id] : undefined;
          const reviewDetails = reviewDetailsByProperty[property.id];
          const saving = savingPropertyId === property.id;
          return (
            <View key={property.id} style={styles.card}>
              <View style={styles.cardHeading}><View style={styles.cardTitleArea}><Text style={styles.cardTitle}>{property.name}</Text><Text style={styles.hostText}>Hosted by {host?.full_name ?? 'Unknown host'}{host?.email ? ` · ${host.email}` : ''}</Text></View><Text style={[styles.status, property.approval_status === 'approved' ? styles.approved : property.approval_status === 'declined' ? styles.declined : styles.pending]}>{property.approval_status}</Text></View>
              <View style={styles.reviewReminder}><Text style={styles.reviewReminderTitle}>Required administrator review</Text><Text style={styles.reviewReminderText}>Review the complete host record, site information, photos, arrival details, rules, and amenities below before approving or declining this site.</Text></View>
              <ReviewSection title="Host record — private administrator view">
                <View style={styles.hostReviewHeader}>
                  {host?.profile_image_path ? <Image contentFit="cover" source={{ uri: supabase.storage.from('host-profile-images').getPublicUrl(host.profile_image_path).data.publicUrl }} style={styles.hostPhoto} /> : <View style={styles.hostPhotoMissing}><Text style={styles.hostPhotoMissingText}>No photo</Text></View>}
                  <View style={styles.hostReviewHeaderCopy}><Text style={styles.hostReviewName}>{host?.full_name ?? 'Unknown host'}</Text><Text style={styles.hostReviewEmail}>{host?.email ?? 'No email provided'}</Text></View>
                </View>
                <ReviewRow label="Phone" value={host?.phone ?? 'Not provided'} />
                <ReviewRow label="Home address" value={formatAddress(host?.home_address, host?.home_city, host?.home_state, host?.home_postal_code)} />
                <ReviewRow label="First private-space address" value={formatAddress(host?.primary_site_address, host?.primary_site_city, host?.primary_site_state, host?.primary_site_postal_code)} />
                <ReviewRow label="Property permission confirmed" value={host?.controls_property ? 'Yes' : 'No'} />
                <ReviewRow label="Host requirements accepted" value={host?.accepted_host_terms_at ? 'Yes' : 'No'} />
                <ReviewRow label="Identity verification" value={formatStatus(host?.identity_verification_status)} />
              </ReviewSection>
              <ReviewSection title="Site overview">
              <Text style={styles.location}>{property.site_address}, {property.city}, {property.state}</Text>
              <Text style={styles.detail}>{property.acreage ?? '—'} acres · ${property.price_per_hour}/hour · {property.is_fully_fenced ? 'Fully fenced' : 'Not listed as fully fenced'} · {property.instant_book ? 'Instant book' : 'Request to book'}</Text>
              <Text style={styles.description}>{property.short_description}</Text>
                <ReviewRow label="Fence height" value={property.fence_height_feet ? `${property.fence_height_feet} ft` : 'Not provided'} />
                <ReviewRow label="Temporary closure" value={property.is_temporarily_closed ? 'Yes' : 'No'} />
              </ReviewSection>
              <ReviewSection title={`Property photos (${reviewDetails?.images.length ?? 0})`}>
                {reviewDetails?.images.length ? <View style={styles.photoGrid}>{reviewDetails.images.map((image) => image.signedUrl ? <Image key={image.id} accessibilityLabel={image.alt_text || 'Property photo'} contentFit="cover" source={{ uri: image.signedUrl }} style={styles.propertyPhoto} /> : null)}</View> : <Text style={styles.missingReviewText}>No property photos uploaded.</Text>}
              </ReviewSection>
              <ReviewSection title="Arrival details and rules">
                <ReviewLongText label="Parking instructions" value={reviewDetails?.details?.parking_instructions} />
                <ReviewLongText label="Gate access" value={reviewDetails?.details?.gate_access_instructions} />
                <ReviewLongText label="Arrival instructions" value={reviewDetails?.details?.arrival_instructions} />
                <ReviewLongText label="Property rules" value={reviewDetails?.details?.property_rules} />
                <ReviewLongText label="Availability notes" value={reviewDetails?.details?.availability_notes} />
              </ReviewSection>
              <ReviewSection title="Amenities"><Text style={styles.amenityReviewText}>{reviewDetails?.amenities.length ? reviewDetails.amenities.map((amenity) => amenityLabels[amenity] ?? amenity).join(' · ') : 'No amenities selected.'}</Text></ReviewSection>
              <Text style={styles.noteLabel}>Required changes for the host</Text>
              <TextInput editable={property.approval_status === 'pending'} multiline onChangeText={(value) => setNotesByProperty((current) => ({ ...current, [property.id]: value }))} placeholder="Describe any changes required before the host resubmits this site" placeholderTextColor="#8A877D" style={[styles.notesInput, property.approval_status !== 'pending' && styles.readOnlyInput]} value={notesByProperty[property.id] ?? ''} />
              {property.approval_status === 'pending' ? (
                <View style={styles.actionRow}>
                  <Pressable disabled={saving} onPress={() => void saveDecision(property, 'declined', 'returned for required changes')} style={[styles.declineButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#A7463B" /> : <Text style={styles.declineText}>Request changes</Text>}</Pressable>
                  <Pressable disabled={saving} onPress={() => void saveDecision(property, 'approved', 'approved and published')} style={[styles.approveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.approveText}>Approve & publish</Text>}</Pressable>
                </View>
              ) : <Text style={styles.finalDecisionText}>This site has already received its final review decision.</Text>}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatAddress(address?: string | null, city?: string | null, state?: string | null, postalCode?: string | null) {
  return [address, [city, state].filter(Boolean).join(', '), postalCode].filter(Boolean).join(' · ') || 'Not provided';
}

function formatStatus(value?: string | null) {
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not started';
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.reviewSection}><Text style={styles.reviewSectionTitle}>{title}</Text>{children}</View>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.reviewRow}><Text style={styles.reviewRowLabel}>{label}</Text><Text style={styles.reviewRowValue}>{value}</Text></View>;
}

function ReviewLongText({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.reviewLongText}><Text style={styles.reviewRowLabel}>{label}</Text><Text style={styles.reviewLongTextValue}>{value?.trim() || 'Not provided'}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  container: { padding: 20, paddingBottom: 52 },
  backButton: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center' },
  backText: { color: colors.brown, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 8 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 7 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  loadingText: { color: colors.muted, fontSize: 15, marginTop: 15 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  filterButton: { borderColor: colors.border, borderRadius: 99, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 },
  filterButtonSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  filterText: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  filterTextSelected: { color: colors.warmWhite },
  card: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 17, borderWidth: 1, marginTop: 16, padding: 16 },
  cardHeading: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  cardTitleArea: { flex: 1 },
  cardTitle: { color: colors.forest, fontSize: 20, fontWeight: '900' },
  hostText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  status: { alignSelf: 'flex-start', borderRadius: 99, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6, textTransform: 'capitalize' },
  pending: { backgroundColor: '#FFF0D1', color: '#8A4F17' },
  approved: { backgroundColor: '#E4F4E8', color: '#237A45' },
  declined: { backgroundColor: '#FDEBE9', color: '#A7463B' },
  reviewReminder: { backgroundColor: '#FFF0D1', borderColor: '#E8C779', borderRadius: 12, borderWidth: 1, marginTop: 15, padding: 12 },
  reviewReminderTitle: { color: '#8A4F17', fontSize: 13, fontWeight: '900' },
  reviewReminderText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  reviewSection: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 16, paddingTop: 16 },
  reviewSectionTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', marginBottom: 10 },
  hostReviewHeader: { alignItems: 'center', flexDirection: 'row', gap: 11, marginBottom: 6 },
  hostPhoto: { borderRadius: 28, height: 56, width: 56 },
  hostPhotoMissing: { alignItems: 'center', backgroundColor: '#E8E3D8', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  hostPhotoMissingText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  hostReviewHeaderCopy: { flex: 1 },
  hostReviewName: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  hostReviewEmail: { color: colors.muted, fontSize: 13, marginTop: 3 },
  reviewRow: { borderTopColor: '#E9E4D9', borderTopWidth: 1, paddingVertical: 9 },
  reviewRowLabel: { color: colors.forest, fontSize: 12, fontWeight: '900' },
  reviewRowValue: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  reviewLongText: { borderTopColor: '#E9E4D9', borderTopWidth: 1, paddingVertical: 10 },
  reviewLongTextValue: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  propertyPhoto: { borderRadius: 10, height: 92, width: 92 },
  missingReviewText: { color: '#A7463B', fontSize: 13, fontWeight: '800' },
  amenityReviewText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  location: { color: colors.forest, fontSize: 14, fontWeight: '800', marginTop: 14 },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  noteLabel: { color: colors.forest, fontSize: 13, fontWeight: '900', marginTop: 17 },
  notesInput: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.forest, fontSize: 14, lineHeight: 20, marginTop: 7, minHeight: 82, padding: 11, textAlignVertical: 'top' },
  readOnlyInput: { backgroundColor: '#F5F2EA', color: colors.muted },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 13 },
  declineButton: { alignItems: 'center', borderColor: '#A7463B', borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  declineText: { color: '#A7463B', fontSize: 15, fontWeight: '900' },
  approveButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, flex: 1.5, justifyContent: 'center', minHeight: 48 },
  approveText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  emptyCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 25 },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  errorText: { color: '#A7463B', fontSize: 14, marginTop: 16 },
  finalDecisionText: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 14 },
  primaryButton: { backgroundColor: colors.forest, borderRadius: 13, marginTop: 20, minHeight: 50, paddingHorizontal: 18, justifyContent: 'center' },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 50, paddingHorizontal: 18 },
  secondaryButtonText: { color: colors.forest, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  returnButton: { alignItems: 'center', justifyContent: 'center', marginTop: 12, minHeight: 44, paddingHorizontal: 18 },
  returnButtonText: { color: colors.brown, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
  disabled: { opacity: 0.6 },
});
