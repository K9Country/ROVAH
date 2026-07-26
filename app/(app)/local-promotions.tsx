import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type PropertyOption = { id: string; name: string; city: string; state: string };
type LocalPromotion = {
  id: string;
  property_id: string;
  message: string;
  status: 'draft' | 'pending_payment' | 'active' | 'expired' | 'rejected' | 'failed' | 'cancelled';
  amount_cents: number;
  image_path: string | null;
  image_url?: string | null;
  eligible_member_count: number;
  delivered_count: number;
  viewed_count: number;
  property_open_count: number;
  ends_at: string | null;
};

const samples = [
  'Give your dog room to run, sniff, and play in a private outdoor space. Reserve your visit today.',
  'A quiet private space is open nearby. Choose a time that works for you and your dog.',
  'Looking for a more peaceful dog outing? This private space is ready for your next visit.',
];
const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxImageBytes = 5 * 1024 * 1024;

export default function LocalPromotionsScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ propertyId?: string }>();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [promotions, setPromotions] = useState<LocalPromotion[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [message, setMessage] = useState(samples[0]);
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState<string | null>(null);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === selectedPropertyId) ?? null,
    [properties, selectedPropertyId]
  );

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const [propertyResult, promotionResult] = await Promise.all([
      supabase.from('properties').select('id, name, city, state').eq('host_id', session.user.id).eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('local_promotions').select('id, property_id, message, status, amount_cents, image_path, eligible_member_count, delivered_count, viewed_count, property_open_count, ends_at').order('created_at', { ascending: false }),
    ]);
    if (propertyResult.error) throw propertyResult.error;
    if (promotionResult.error) throw promotionResult.error;

    const loadedProperties = (propertyResult.data ?? []) as PropertyOption[];
    const promotionRows = (promotionResult.data ?? []) as LocalPromotion[];
    const imagePaths = promotionRows.map((promotion) => promotion.image_path).filter((path): path is string => Boolean(path));
    const { data: signedUrls } = imagePaths.length
      ? await supabase.storage.from('promotion-images').createSignedUrls(imagePaths, 60 * 60)
      : { data: [] as { path: string; signedUrl: string }[] };
    const urlsByPath = new Map((signedUrls ?? []).flatMap((file) => file.path && file.signedUrl ? [[file.path, file.signedUrl]] : []));

    setProperties(loadedProperties);
    setPromotions(promotionRows.map((promotion) => ({ ...promotion, image_url: promotion.image_path ? urlsByPath.get(promotion.image_path) ?? null : null })));
    setSelectedPropertyId((current) => current ?? (typeof params.propertyId === 'string' && loadedProperties.some((property) => property.id === params.propertyId) ? params.propertyId : loadedProperties[0]?.id ?? null));
  }, [params.propertyId, session?.user.id]);

  useEffect(() => {
    void (async () => {
      try { setIsLoading(true); await load(); }
      catch (error) { Alert.alert('Unable to load promotions', error instanceof Error ? error.message : 'Please try again.'); }
      finally { setIsLoading(false); }
    })();
  }, [load]);

  const choosePromotionImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to attach a picture of your private space.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.mimeType && !supportedMimeTypes.includes(asset.mimeType)) {
      Alert.alert('Choose a photo', 'Please select a JPG, PNG, or WebP image.');
      return;
    }
    if (typeof asset.fileSize === 'number' && asset.fileSize > maxImageBytes) {
      Alert.alert('Photo is too large', 'Choose an image smaller than 5 MB.');
      return;
    }
    setSelectedImage(asset);
  };

  const uploadPromotionImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!session?.user.id) throw new Error('Please sign in again before uploading a photo.');
    const contentType = supportedMimeTypes.includes(asset.mimeType ?? '') ? asset.mimeType! : 'image/jpeg';
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${session.user.id}/promotion-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('We could not read that photo. Please choose it again.');
    const { error } = await supabase.storage.from('promotion-images').upload(path, await response.arrayBuffer(), { contentType, upsert: false });
    if (error) throw error;
    return path;
  };

  const createDraft = async () => {
    if (!selectedPropertyId || isSaving) return;
    let uploadedImagePath: string | null = null;
    try {
      setIsSaving(true);
      if (selectedImage) uploadedImagePath = await uploadPromotionImage(selectedImage);
      const { data, error } = await supabase.rpc('create_site_promotion_draft', {
        p_property_id: selectedPropertyId,
        p_message: message.trim(),
        p_image_path: uploadedImagePath,
      });
      if (error) throw error;
      const promotion = data as LocalPromotion;
      setSelectedImage(null);
      Alert.alert(
        'Promotion ready to review',
        `Your estimated audience is ${promotion.eligible_member_count} eligible dog owner${promotion.eligible_member_count === 1 ? '' : 's'} within 25 miles. Past visitors and currently booked guests at this site are excluded. Review it below, then continue to secure payment to activate it.`
      );
      await load();
    } catch (error) {
      if (uploadedImagePath) await supabase.storage.from('promotion-images').remove([uploadedImagePath]);
      Alert.alert('Unable to prepare promotion', error instanceof Error ? error.message : 'Please review the message and try again.');
    } finally { setIsSaving(false); }
  };

  const startCheckout = async (promotionId: string) => {
    if (isStartingCheckout) return;
    try {
      setIsStartingCheckout(promotionId);
      const { data, error } = await supabase.functions.invoke('start-site-promotion-checkout', { body: { promotionId } });
      if (error) {
        const response = 'context' in error && error.context instanceof Response ? error.context : null;
        const failure = response ? await response.json().catch(() => null) as { error?: string } | null : null;
        throw new Error(failure?.error ?? error.message);
      }
      if (!data?.checkoutUrl) throw new Error(data?.error ?? 'Secure promotion checkout is not available.');
      await Linking.openURL(data.checkoutUrl);
      await load();
    } catch (error) {
      Alert.alert('Promotion not activated', error instanceof Error ? error.message : 'Secure promotion checkout is not configured. Your draft remains private.');
    } finally { setIsStartingCheckout(null); }
  };

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backText}>Host Dashboard</Text></Pressable>
    <Text style={styles.eyebrow}>GROW YOUR SITE</Text>
    <Text style={styles.title}>Connect with dog owners who have not visited your site</Text>
    <Text style={styles.description}>For just $2, send your site’s message directly to new local customers through their ROVAH messenger. Your promotion reaches registered dog owners within 25 miles who have not visited your site, helping you introduce your private space to fresh local members without bothering existing guests.</Text>
    <View style={styles.setupCard}>
      <Text style={styles.setupLabel}>SITE PROMOTION</Text>
      <Text style={styles.setupTitle}>$2.00</Text>
      <Text style={styles.setupText}>First review your audience count and message. A promotion is activated only after Stripe confirms payment.</Text>
    </View>
    <View style={styles.benefitCard}>
      <Text style={styles.benefitTitle}>Private, local, and site-specific</Text>
      <Text style={styles.benefitText}>• Only opted-in, registered dog-owner accounts with a verified saved location within 25 miles are eligible.</Text>
      <Text style={styles.benefitText}>• Past visitors and currently booked guests at this site are excluded.</Text>
      <Text style={styles.benefitText}>• You see an audience count and results—not member names, contact details, or locations.</Text>
      <Text style={styles.benefitText}>• Your optional image and message appear in the eligible member’s in-app discovery experience.</Text>
    </View>

    {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : properties.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Publish a private space first</Text><Text style={styles.emptyText}>Promotions are available for approved, published properties only.</Text></View> : <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>1. Choose the site to feature</Text>
        <Text style={styles.sectionDescription}>Each promotion stays connected to this one site only.</Text>
        {properties.map((property) => <Pressable key={property.id} accessibilityRole="button" onPress={() => setSelectedPropertyId(property.id)} style={[styles.propertyOption, selectedPropertyId === property.id && styles.propertyOptionSelected]}><View><Text style={styles.propertyName}>{property.name}</Text><Text style={styles.propertyLocation}>{property.city}, {property.state}</Text></View><Text style={styles.optionMark}>{selectedPropertyId === property.id ? 'SELECTED' : 'SELECT'}</Text></Pressable>)}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2. Write your in-app message</Text>
        <Text style={styles.sectionDescription}>Use a sample or make it your own. Messages are screened before payment can begin.</Text>
        <View style={styles.sampleRow}>{samples.map((sample, index) => <Pressable key={sample} onPress={() => setMessage(sample)} style={[styles.sampleButton, message === sample && styles.sampleButtonSelected]}><Text style={[styles.sampleText, message === sample && styles.sampleTextSelected]}>Sample {index + 1}</Text></Pressable>)}</View>
        <TextInput accessibilityLabel="Promotion message" multiline maxLength={280} onChangeText={setMessage} placeholder="Tell nearby dog owners why your space is worth a visit." placeholderTextColor="#8A857A" style={styles.messageInput} value={message} />
        <Text style={styles.characterCount}>{message.trim().length}/280</Text>
        <View style={styles.photoSection}><Text style={styles.photoLabel}>Add a site photo (optional)</Text><Text style={styles.photoHint}>Use a clear photo that helps this specific property stand out.</Text><Pressable accessibilityRole="button" onPress={() => void choosePromotionImage()} style={styles.photoButton}><Text style={styles.photoButtonText}>Choose Photo</Text></Pressable>{selectedImage ? <View style={styles.selectedPhoto}><Image contentFit="cover" source={{ uri: selectedImage.uri }} style={styles.selectedPhotoImage} /><View style={styles.selectedPhotoContent}><Text numberOfLines={1} style={styles.selectedPhotoTitle}>Photo ready for review</Text><Pressable onPress={() => setSelectedImage(null)}><Text style={styles.removePhotoText}>Remove photo</Text></Pressable></View></View> : null}</View>
        <Pressable accessibilityRole="button" onPress={() => setShowPreview((value) => !value)} style={styles.previewButton}><Text style={styles.previewButtonText}>{showPreview ? 'Hide Preview' : 'Preview Promotion'}</Text></Pressable>
        {showPreview ? <View style={styles.previewCard}><Text style={styles.previewEyebrow}>MEMBER DISCOVERY PREVIEW</Text>{selectedImage ? <Image contentFit="cover" source={{ uri: selectedImage.uri }} style={styles.previewImage} /> : null}<Text style={styles.previewTitle}>{selectedProperty?.name ?? 'Your private space'}</Text><Text style={styles.previewMessage}>{message.trim() || 'Your message will appear here.'}</Text><View style={styles.previewAction}><Text style={styles.previewActionText}>View Private Space</Text></View></View> : null}
      </View>
      <Pressable accessibilityRole="button" disabled={!selectedPropertyId || !message.trim() || isSaving} onPress={() => void createDraft()} style={[styles.saveButton, (!selectedPropertyId || !message.trim() || isSaving) && styles.disabledButton]}>{isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.saveButtonText}>Send My Message — $2</Text>}</Pressable>
      <Text style={styles.saveNote}>Review creates a private draft. It does not send anything and does not charge you.</Text>
    </>}
    <Text style={styles.historyHeading}>Promotion History</Text>
    {promotions.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No promotions yet</Text><Text style={styles.emptyText}>Prepare one above to see your private local audience estimate before payment.</Text></View> : promotions.map((promotion) => <View key={promotion.id} style={styles.historyCard}><View style={styles.historyHeader}><Text style={styles.historyStatus}>{promotion.status.replace('_', ' ')}</Text><Text style={styles.historyPrice}>$2.00</Text></View>{promotion.image_url ? <Image accessibilityLabel="Promotion spot photo" contentFit="cover" source={{ uri: promotion.image_url }} style={styles.historyImage} /> : null}<Text numberOfLines={3} style={styles.historyMessage}>{promotion.message}</Text><View style={styles.resultsRow}><Result label="Eligible" value={promotion.eligible_member_count} /><Result label="Views" value={promotion.viewed_count} /><Result label="Opens" value={promotion.property_open_count} /></View>{promotion.status === 'draft' ? <><Text style={styles.historyNote}>Private draft. Confirm its message and audience, then pay securely to activate it.</Text><Pressable accessibilityRole="button" disabled={Boolean(isStartingCheckout)} onPress={() => void startCheckout(promotion.id)} style={[styles.checkoutButton, isStartingCheckout === promotion.id && styles.disabledButton]}>{isStartingCheckout === promotion.id ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.checkoutButtonText}>Confirm & Pay $2.00</Text>}</Pressable></> : <Text style={styles.historyNote}>{promotion.status === 'active' && promotion.ends_at ? `Active until ${new Date(promotion.ends_at).toLocaleString()}.` : 'This promotion is not active. It was not delivered unless payment was confirmed.'}</Text>}</View>)}
  </ScrollView></SafeAreaView>;
}

function Result({ label, value }: { label: string; value: number }) { return <View style={styles.result}><Text style={styles.resultValue}>{value}</Text><Text style={styles.resultLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 42 }, backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 8 }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 5 }, description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }, setupCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 17 }, setupLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, setupTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginTop: 5 }, setupText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 }, benefitCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 16 }, benefitTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' }, benefitText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 }, loading: { paddingVertical: 48 }, card: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 16 }, sectionTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' }, sectionDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 }, propertyOption: { alignItems: 'center', borderColor: colors.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, minHeight: 62, padding: 12 }, propertyOptionSelected: { backgroundColor: colors.lightGreen, borderColor: colors.olive }, propertyName: { color: colors.forest, fontSize: 15, fontWeight: '900' }, propertyLocation: { color: colors.muted, fontSize: 13, marginTop: 3 }, optionMark: { color: colors.forest, fontSize: 12, fontWeight: '900' }, sampleRow: { flexDirection: 'row', gap: 7, marginTop: 14 }, sampleButton: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 }, sampleButtonSelected: { backgroundColor: colors.forest, borderColor: colors.forest }, sampleText: { color: colors.forest, fontSize: 12, fontWeight: '900' }, sampleTextSelected: { color: colors.warmWhite }, messageInput: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 15, lineHeight: 21, marginTop: 14, minHeight: 122, padding: 13 }, characterCount: { color: colors.muted, fontSize: 12, marginTop: 6, textAlign: 'right' }, photoSection: { marginTop: 13 }, photoLabel: { color: colors.forest, fontSize: 15, fontWeight: '900' }, photoHint: { color: colors.muted, fontSize: 12, marginTop: 3 }, photoButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 9, minHeight: 44 }, photoButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900' }, selectedPhoto: { alignItems: 'center', backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginTop: 10, overflow: 'hidden' }, selectedPhotoImage: { height: 74, width: 96 }, selectedPhotoContent: { flex: 1, paddingHorizontal: 11, paddingVertical: 8 }, selectedPhotoTitle: { color: colors.forest, fontSize: 13, fontWeight: '900', lineHeight: 18 }, removePhotoText: { color: '#9B4E3B', fontSize: 13, fontWeight: '900', marginTop: 6 }, previewButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 44 }, previewButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900' }, previewCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 14, borderWidth: 1, marginTop: 14, padding: 14 }, previewEyebrow: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, previewImage: { borderRadius: 10, height: 160, marginTop: 11, width: '100%' }, previewTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginTop: 8 }, previewMessage: { color: colors.forest, fontSize: 14, lineHeight: 20, marginTop: 7 }, previewAction: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 10, justifyContent: 'center', marginTop: 12, minHeight: 42 }, previewActionText: { color: colors.warmWhite, fontSize: 13, fontWeight: '900' }, saveButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 54 }, disabledButton: { opacity: 0.55 }, saveButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, saveNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginHorizontal: 8, marginTop: 9, textAlign: 'center' }, historyHeading: { color: colors.forest, fontSize: 21, fontWeight: '900', marginBottom: 12, marginTop: 30 }, emptyCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, padding: 17 }, emptyTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }, historyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginBottom: 11, padding: 15 }, historyHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, historyStatus: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' }, historyPrice: { color: colors.forest, fontSize: 15, fontWeight: '900' }, historyImage: { borderRadius: 11, height: 138, marginTop: 11, width: '100%' }, historyMessage: { color: colors.forest, fontSize: 14, lineHeight: 20, marginTop: 8 }, resultsRow: { flexDirection: 'row', gap: 8, marginTop: 13 }, result: { backgroundColor: colors.cream, borderRadius: 10, flex: 1, paddingVertical: 8 }, resultValue: { color: colors.forest, fontSize: 17, fontWeight: '900', textAlign: 'center' }, resultLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: 2, textAlign: 'center' }, historyNote: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 11 }, checkoutButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, justifyContent: 'center', marginTop: 12, minHeight: 46 }, checkoutButtonText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' },
});
