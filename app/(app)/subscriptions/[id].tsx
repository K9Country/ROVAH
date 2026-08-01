import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../services/auth-context';

type PropertySummary = { id: string; name: string; price_per_hour: number | string };
type SubscriptionOffer = { id: string; name: string; credit_count: number; package_price: number | string; duration_months: number; is_active: boolean };
type MemberLoyaltyPass = { loyalty_pass_offer_id: string; credit_hours_total: number | string; credit_hours_remaining: number | string };
type SubscriptionCreditSummary = { passCount: number; totalCredits: number; remainingCredits: number };
type SubscriptionDraft = { id?: string; name: string; creditCount: string; packageDiscount: string; durationMonths: string };

const emptyDraft = (): SubscriptionDraft => ({ name: '', creditCount: '10', packageDiscount: '', durationMonths: '12' });

export default function SubscriptionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [offers, setOffers] = useState<SubscriptionOffer[]>([]);
  const [creditSummaries, setCreditSummaries] = useState<Record<string, SubscriptionCreditSummary>>({});
  const [draft, setDraft] = useState<SubscriptionDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [endingOfferId, setEndingOfferId] = useState<string | null>(null);

  const hourlyRate = Number(property?.price_per_hour ?? 0);
  const credits = Number(draft.creditCount) || 0;
  const discount = Number(draft.packageDiscount) || 0;
  const duration = Number(draft.durationMonths) || 0;
  const originalCost = credits * hourlyRate;
  const subscriptionPrice = originalCost * (1 - discount / 100);
  const guestSavings = originalCost - subscriptionPrice;
  const platformFee = originalCost * 0.18;
  const hostPayout = subscriptionPrice - platformFee;

  const load = useCallback(async () => {
    if (!id || !session?.user.id) { setIsLoading(false); return; }
    setIsLoading(true);
    const [propertyResult, offersResult, passesResult] = await Promise.all([
      supabase.from('properties').select('id, name, price_per_hour').eq('id', id).eq('host_id', session.user.id).maybeSingle(),
      supabase.from('loyalty_pass_offers').select('id, name, credit_count, package_price, duration_months, is_active').eq('property_id', id).order('created_at', { ascending: false }),
      supabase.from('member_loyalty_passes').select('loyalty_pass_offer_id, credit_hours_total, credit_hours_remaining').eq('property_id', id).eq('status', 'active'),
    ]);
    const error = propertyResult.error ?? offersResult.error ?? passesResult.error;
    if (error) { Alert.alert('Unable to load subscriptions', error.message); setIsLoading(false); return; }
    setProperty(propertyResult.data as PropertySummary | null);
    setOffers((offersResult.data ?? []) as SubscriptionOffer[]);
    const summaries = ((passesResult.data ?? []) as MemberLoyaltyPass[]).reduce<Record<string, SubscriptionCreditSummary>>((current, pass) => {
      const summary = current[pass.loyalty_pass_offer_id] ?? { passCount: 0, totalCredits: 0, remainingCredits: 0 };
      summary.passCount += 1;
      summary.totalCredits += Number(pass.credit_hours_total);
      summary.remainingCredits += Number(pass.credit_hours_remaining);
      current[pass.loyalty_pass_offer_id] = summary;
      return current;
    }, {});
    setCreditSummaries(summaries);
    setIsLoading(false);
  }, [id, session?.user.id]);

  useEffect(() => { void load(); }, [load]);

  const startNew = () => setDraft(emptyDraft());
  const editOffer = (offer: SubscriptionOffer) => {
    const regularValue = offer.credit_count * hourlyRate;
    const existingDiscount = regularValue > 0 ? Math.max(0, Math.min(82, Math.round((1 - Number(offer.package_price) / regularValue) * 100))) : 0;
    setDraft({ id: offer.id, name: offer.name, creditCount: String(offer.credit_count), packageDiscount: String(existingDiscount), durationMonths: String(offer.duration_months) });
  };

  const save = async () => {
    if (!id || !property || isSaving) return;
    if (!draft.name.trim() || !Number.isInteger(credits) || credits < 1 || credits > 50 || !Number.isInteger(discount) || discount < 1 || discount > 82 || !Number.isInteger(duration) || duration < 1 || duration > 12) {
      Alert.alert('Complete your Subscription', 'Add a name, 1 to 50 one-hour credits, a package discount from 1% to 82%, and a duration from 1 to 12 months.');
      return;
    }
    try {
      setIsSaving(true);
      const values = { property_id: id, name: draft.name.trim(), credit_count: credits, package_price: subscriptionPrice, duration_months: duration, is_active: true, updated_at: new Date().toISOString() };
      const result = draft.id
        ? await supabase.from('loyalty_pass_offers').update(values).eq('id', draft.id).eq('property_id', id)
        : await supabase.from('loyalty_pass_offers').insert(values);
      if (result.error) throw result.error;
      Alert.alert('Subscription saved', 'Guests can now see this subscription on this site.');
      setDraft(emptyDraft());
      await load();
    } catch (error) {
      Alert.alert('Unable to save subscription', error instanceof Error ? error.message : 'Please try again.');
    } finally { setIsSaving(false); }
  };

  const completeEndOffer = async (offer: SubscriptionOffer) => {
    if (!id || endingOfferId) return;
    try {
      setEndingOfferId(offer.id);
      const { data, error } = await supabase
        .from('loyalty_pass_offers')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', offer.id)
        .eq('property_id', id)
        .select('id, is_active')
        .maybeSingle();

      if (error) throw error;
      if (!data || data.is_active) throw new Error('This subscription could not be ended. Please refresh and try again.');

      if (draft.id === offer.id) setDraft(emptyDraft());
      setOffers((current) => current.map((entry) => entry.id === offer.id ? { ...entry, is_active: false } : entry));
      Alert.alert('Subscription ended', 'It is no longer available for new guest purchases.');
    } catch (error) {
      Alert.alert('Unable to end subscription', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setEndingOfferId(null);
    }
  };

  const endOffer = (offer: SubscriptionOffer) => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(
        'End this subscription? It will no longer be offered to new guests. Existing purchase records stay intact.'
      );
      if (confirmed) void completeEndOffer(offer);
      return;
    }

    Alert.alert('End this subscription?', 'It will no longer be offered to new guests. Your existing records stay intact.', [
      { text: 'Keep Active', style: 'cancel' },
      { text: 'End Subscription', style: 'destructive', onPress: () => void completeEndOffer(offer) },
    ]);
  };

  const activeOffers = useMemo(() => offers.filter((offer) => offer.is_active), [offers]);

  if (isLoading) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} /></View></SafeAreaView>;
  if (!property) return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.title}>This site is unavailable</Text><Pressable onPress={() => router.replace('/host-dashboard')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Host Dashboard</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backText}>Host Dashboard</Text></Pressable>
    <Text style={styles.eyebrow}>GROW YOUR SITE</Text>
    <Text style={styles.title}>Manage Subscriptions</Text>
    <Text style={styles.description}>Create discounted prepaid visit packages for guests who choose {property.name} as a regular spot. The package discount applies to the regular price for every dog the guest selects.</Text>

    <View style={styles.siteCard}><Text style={styles.siteLabel}>THIS SITE</Text><Text style={styles.siteName}>{property.name}</Text><Text style={styles.siteRate}>Standard hourly rate: ${hourlyRate.toFixed(2)}</Text></View>

    <Text style={styles.sectionHeading}>Active subscriptions</Text>
    {activeOffers.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No active subscriptions yet</Text><Text style={styles.emptyText}>Create one below when you want to reward repeat guests at this site.</Text></View> : activeOffers.map((offer) => <OfferCard key={offer.id} offer={offer} creditSummary={creditSummaries[offer.id]} hourlyRate={hourlyRate} isEnding={endingOfferId === offer.id} onEdit={() => editOffer(offer)} onEnd={() => void endOffer(offer)} />)}

    <View style={styles.editorCard}>
      <Text style={styles.sectionHeading}>{draft.id ? 'Edit subscription' : 'Create a subscription'}</Text>
      <Text style={styles.editorText}>Each credit covers one hour. You choose the number of credits, package discount, and validity period. Guests see the discounted package price for the number of dogs they select, with no later extra-dog fee on included visits.</Text>
      <Field label="Subscription name" value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} placeholder="Example: 10-Visit Subscription" />
      <View style={styles.fieldRow}>
        <View style={styles.flexField}><Field keyboardType="number-pad" label="One-hour visit credits" maxLength={2} value={draft.creditCount} onChangeText={(creditCount) => setDraft((current) => ({ ...current, creditCount: creditCount.replace(/[^0-9]/g, '') }))} placeholder="10" /></View>
        <View style={styles.flexField}><Field keyboardType="number-pad" label="Package discount (%)" maxLength={2} value={draft.packageDiscount} onChangeText={(packageDiscount) => setDraft((current) => ({ ...current, packageDiscount: packageDiscount.replace(/[^0-9]/g, '') }))} placeholder="20" suffix="%" /></View>
      </View>
      <Field keyboardType="number-pad" label="Subscription duration in months" maxLength={2} value={draft.durationMonths} onChangeText={(durationMonths) => setDraft((current) => ({ ...current, durationMonths: durationMonths.replace(/[^0-9]/g, '') }))} placeholder="1 to 12" />
      <View style={styles.mathCard}>
        <Text style={styles.mathTitle}>At a glance</Text>
        <MathRow label="Original cost" value={`$${originalCost.toFixed(2)}`} />
        <MathRow label="Package discount" value={`${discount}%`} />
        <MathRow label="Subscription price" value={`$${subscriptionPrice.toFixed(2)}`} />
        <MathRow label="Guest savings" value={`$${Math.max(0, guestSavings).toFixed(2)}`} />
        <MathRow label="ROVAH fee (18%)" value={`$${platformFee.toFixed(2)}`} />
        <MathRow emphasis label="Estimated payout before Stripe fee" value={`$${hostPayout.toFixed(2)}`} />
      </View>
      <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void save()} style={[styles.primaryButton, isSaving && styles.disabled]}>{isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>{draft.id ? 'Save Subscription Changes' : 'Create Subscription'}</Text>}</Pressable>
      {draft.id ? <Pressable accessibilityRole="button" onPress={startNew} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Create Another Subscription</Text></Pressable> : null}
    </View>

    <View style={styles.guideCard}>
      <Text style={styles.guideTitle}>How to manage subscriptions</Text>
      <Text style={styles.guideText}><Text style={styles.guideStrong}>What guests buy:</Text> Each credit covers one hour at this site. A one-hour booking uses one credit; a two-hour booking uses two.</Text>
      <Text style={styles.guideText}><Text style={styles.guideStrong}>Expiration:</Text> Credits remain usable through 10:00 p.m. on the final valid day in this site’s local time zone.</Text>
      <Text style={styles.guideText}><Text style={styles.guideStrong}>Create or modify:</Text> Active subscriptions are packages guests can choose for this private space. Changes apply to future purchases.</Text>
      <Text style={styles.guideText}><Text style={styles.guideStrong}>End subscription:</Text> Stops new purchases. Members who already bought the package keep their recorded credits and expiration date.</Text>
    </View>
  </ScrollView></SafeAreaView>;
}

function OfferCard({ offer, creditSummary, hourlyRate, isEnding = false, onEdit, onEnd, onReuse }: { offer: SubscriptionOffer; creditSummary?: SubscriptionCreditSummary; hourlyRate: number; isEnding?: boolean; onEdit?: () => void; onEnd?: () => void; onReuse?: () => void }) {
  const originalCost = offer.credit_count * hourlyRate;
  const savings = Math.max(0, originalCost - Number(offer.package_price));
  return <View style={[styles.offerCard, !offer.is_active && styles.endedCard]}><View style={styles.offerHeader}><Text style={styles.offerName}>{offer.name}</Text><Text style={styles.offerStatus}>{offer.is_active ? 'ACTIVE' : 'ENDED'}</Text></View><Text style={styles.offerDetails}>{offer.credit_count} one-hour credits · ${Number(offer.package_price).toFixed(2)} · Save ${savings.toFixed(2)} · Valid {offer.duration_months} {offer.duration_months === 1 ? 'month' : 'months'}</Text>{creditSummary ? <View style={styles.creditCountdown}><Text style={styles.creditCountdownLabel}>GUEST VISIT CREDITS REMAINING</Text><Text style={styles.creditCountdownValue}>{creditSummary.remainingCredits} of {creditSummary.totalCredits} across {creditSummary.passCount} {creditSummary.passCount === 1 ? 'guest package' : 'guest packages'}</Text></View> : <Text style={styles.noCreditsText}>No guest packages are active yet.</Text>}<View style={styles.offerActions}>{offer.is_active && onEdit ? <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editButton}><Text style={styles.editButtonText}>Modify</Text></Pressable> : null}{onReuse ? <Pressable accessibilityRole="button" onPress={onReuse} style={styles.reuseButton}><Text style={styles.reuseButtonText}>Reuse</Text></Pressable> : null}{onEnd ? <Pressable accessibilityRole="button" onPress={onEnd} style={styles.endButton}><Text style={styles.endButtonText}>End Subscription</Text></Pressable> : null}</View></View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', maxLength, suffix }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad'; maxLength?: number; suffix?: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={suffix ? styles.inputWithSuffix : undefined}><TextInput accessibilityLabel={label} keyboardType={keyboardType} maxLength={maxLength} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8A877D" style={[styles.input, suffix && styles.inputSuffixField]} value={value} />{suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}</View></View>;
}

function MathRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <View style={[styles.mathRow, emphasis && styles.mathRowEmphasis]}><Text style={[styles.mathLabel, emphasis && styles.mathEmphasis]}>{label}</Text><Text style={[styles.mathValue, emphasis && styles.mathEmphasis]}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 42 }, centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 }, backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 8 }, title: { color: colors.forest, fontSize: 29, fontWeight: '900', marginTop: 5 }, description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 9 }, siteCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 16 }, siteLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, siteName: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 4 }, siteRate: { color: colors.muted, fontSize: 13, marginTop: 4 }, sectionHeading: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 7, marginTop: 22 }, emptyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 16 }, emptyTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 }, offerCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 15 }, endedCard: { opacity: 0.72 }, offerHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, offerName: { color: colors.forest, flex: 1, fontSize: 16, fontWeight: '900', paddingRight: 8 }, offerStatus: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }, offerDetails: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }, creditCountdown: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 12 }, creditCountdownLabel: { color: colors.brown, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }, creditCountdownValue: { color: colors.forest, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 4 }, noCreditsText: { color: colors.muted, fontSize: 13, fontStyle: 'italic', marginTop: 12 }, offerActions: { flexDirection: 'row', gap: 9, marginTop: 13 }, editButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42 }, editButtonText: { color: colors.forest, fontSize: 13, fontWeight: '900' }, reuseButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 11, flex: 1, justifyContent: 'center', minHeight: 42 }, reuseButtonText: { color: colors.warmWhite, fontSize: 13, fontWeight: '900' }, endButton: { alignItems: 'center', borderColor: '#A55245', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42 }, endButtonText: { color: '#A55245', fontSize: 13, fontWeight: '900' }, editorCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 16 }, editorText: { color: colors.muted, fontSize: 14, lineHeight: 20 }, field: { marginTop: 15 }, fieldLabel: { color: colors.forest, fontSize: 13, fontWeight: '900', marginBottom: 7 }, input: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.forest, fontSize: 15, minHeight: 50, paddingHorizontal: 13 }, fieldRow: { flexDirection: 'row', gap: 10 }, flexField: { flex: 1, minWidth: 0 }, inputWithSuffix: { position: 'relative' }, inputSuffixField: { paddingRight: 32 }, suffix: { color: colors.forest, fontSize: 15, fontWeight: '900', position: 'absolute', right: 13, top: 15 }, mathCard: { backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 14, borderWidth: 1, marginTop: 18, padding: 14 }, mathTitle: { color: colors.forest, fontSize: 15, fontWeight: '900', marginBottom: 7 }, mathRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }, mathRowEmphasis: { borderTopColor: '#AFC6A6', borderTopWidth: 1, marginTop: 4, paddingTop: 10 }, mathLabel: { color: colors.muted, flex: 1, fontSize: 13 }, mathValue: { color: colors.forest, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900', textAlign: 'right' }, mathEmphasis: { color: colors.forest, fontSize: 14, fontWeight: '900' }, primaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 13, justifyContent: 'center', marginTop: 18, minHeight: 52, paddingHorizontal: 16 }, primaryButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' }, secondaryButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 48 }, secondaryButtonText: { color: colors.forest, fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.55 }, endedHeading: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 27 }, guideCard: { backgroundColor: colors.forest, borderRadius: 18, marginTop: 24, padding: 17 }, guideTitle: { color: colors.warmWhite, fontSize: 18, fontWeight: '900' }, guideText: { color: '#F4F1E7', fontSize: 14, lineHeight: 21, marginTop: 10 }, guideStrong: { color: colors.warmWhite, fontWeight: '900' },
});
