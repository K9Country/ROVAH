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
  instant_book: boolean;
  is_published: boolean;
  approval_status: ApprovalStatus;
  review_notes: string | null;
  created_at: string;
};

type HostSummary = { user_id: string; full_name: string; email: string | null; city: string | null; state: string | null };

export default function AdministratorScreen() {
  const { session } = useAuth();
  const [properties, setProperties] = useState<ReviewProperty[]>([]);
  const [hosts, setHosts] = useState<Record<string, HostSummary>>({});
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
    const [propertiesResult, hostsResult] = await Promise.all([
      supabase.from('properties').select('*').order('created_at', { ascending: true }),
      supabase.from('host_profiles').select('user_id, full_name, email, city, state'),
    ]);

    if (propertiesResult.error || hostsResult.error) {
      setErrorMessage(propertiesResult.error?.message ?? hostsResult.error?.message ?? 'Unable to load the review queue.');
      setIsLoading(false);
      return;
    }

    const nextProperties = (propertiesResult.data ?? []) as ReviewProperty[];
    const nextHosts = Object.fromEntries(
      ((hostsResult.data ?? []) as HostSummary[]).map((host) => [host.user_id, host])
    );
    setProperties(nextProperties);
    setHosts(nextHosts);
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

  const decideProperty = async (property: ReviewProperty, decision: Extract<ApprovalStatus, 'approved' | 'declined'>) => {
    if (!session?.user.id || savingPropertyId) return;

    const action = decision === 'approved' ? 'approve' : 'decline';
    Alert.alert(
      `${decision === 'approved' ? 'Approve' : 'Decline'} ${property.name}?`,
      decision === 'approved'
        ? 'The site will become visible to guests in search.'
        : 'The site will be hidden from guest search until it is reviewed again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approved' ? 'Approve site' : 'Decline site',
          style: decision === 'declined' ? 'destructive' : 'default',
          onPress: () => void saveDecision(property, decision, action),
        },
      ]
    );
  };

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
      Alert.alert('Site updated', `${property.name} was ${action}d.`);
    } catch (error) {
      Alert.alert('Unable to update site', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingPropertyId(null);
    }
  };

  if (isLoading) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} size="large" /><Text style={styles.loadingText}>Opening administrator area…</Text></View></SafeAreaView>;
  }

  if (!isAdministrator) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Administrator access only</Text>
          <Text style={styles.description}>This area is available only to authorized K9 Country administrators.</Text>
          <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Return to host area</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}><Text style={styles.backText}>‹ Host area</Text></Pressable>
        <Text style={styles.eyebrow}>K9 COUNTRY ADMINISTRATOR</Text>
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
          const saving = savingPropertyId === property.id;
          return (
            <View key={property.id} style={styles.card}>
              <View style={styles.cardHeading}><View style={styles.cardTitleArea}><Text style={styles.cardTitle}>{property.name}</Text><Text style={styles.hostText}>Hosted by {host?.full_name ?? 'Unknown host'}{host?.email ? ` · ${host.email}` : ''}</Text></View><Text style={[styles.status, property.approval_status === 'approved' ? styles.approved : property.approval_status === 'declined' ? styles.declined : styles.pending]}>{property.approval_status}</Text></View>
              <Text style={styles.location}>{property.site_address}, {property.city}, {property.state}</Text>
              <Text style={styles.detail}>{property.acreage ?? '—'} acres · ${property.price_per_hour}/hour · {property.is_fully_fenced ? 'Fully fenced' : 'Not listed as fully fenced'} · {property.instant_book ? 'Instant book' : 'Request to book'}</Text>
              <Text style={styles.description}>{property.short_description}</Text>
              <Text style={styles.noteLabel}>Administrator notes for the host</Text>
              <TextInput editable={property.approval_status === 'pending'} multiline onChangeText={(value) => setNotesByProperty((current) => ({ ...current, [property.id]: value }))} placeholder="Optional notes or requested changes" placeholderTextColor="#8A877D" style={[styles.notesInput, property.approval_status !== 'pending' && styles.readOnlyInput]} value={notesByProperty[property.id] ?? ''} />
              {property.approval_status === 'pending' ? (
                <View style={styles.actionRow}>
                  <Pressable disabled={saving} onPress={() => void decideProperty(property, 'declined')} style={[styles.declineButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#A7463B" /> : <Text style={styles.declineText}>Decline</Text>}</Pressable>
                  <Pressable disabled={saving} onPress={() => void decideProperty(property, 'approved')} style={[styles.approveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.approveText}>Approve & publish</Text>}</Pressable>
                </View>
              ) : <Text style={styles.finalDecisionText}>This site has already received its final review decision.</Text>}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
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
  disabled: { opacity: 0.6 },
});
