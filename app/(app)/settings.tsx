import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { HostPageGuide } from '../../components/host-page-guide';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type Preferences = {
  booking_updates: boolean;
  message_updates: boolean;
  review_reminders: boolean;
  product_updates: boolean;
  local_promotions: boolean;
};

const defaults: Preferences = { booking_updates: true, message_updates: true, review_reminders: true, product_updates: false, local_promotions: false };

export default function SettingsScreen() {
  const { session } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!session?.user.id) return;
      const { data } = await supabase.from('member_notification_preferences').select('booking_updates, message_updates, review_reminders, product_updates, local_promotions').eq('user_id', session.user.id).maybeSingle();
      if (data) setPreferences(data as Preferences);
      setIsLoading(false);
    };
    void load();
  }, [session?.user.id]);

  const update = async (key: keyof Preferences) => {
    if (!session?.user.id || isSaving) return;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    try {
      setIsSaving(true);
      const { error } = await supabase.from('member_notification_preferences').upsert({ user_id: session.user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch {
      setPreferences(preferences);
      Alert.alert('Unable to update preferences', 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
    <Text style={[styles.title, memberUi.pageTitle]}>Settings & Privacy</Text>
    <Text style={[styles.description, memberUi.pageDescription]}>Choose the updates you want from ROVAH. Delivery channels are enabled as the service is configured.</Text>
    {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : <View style={styles.section}>
      <Text style={styles.sectionTitle}>Notifications</Text>
      <SettingRow label="Reservation updates" detail="Confirmations, changes, and cancellations" value={preferences.booking_updates} onPress={() => void update('booking_updates')} />
      <SettingRow label="Message updates" detail="New messages from hosts or guests" value={preferences.message_updates} onPress={() => void update('message_updates')} />
      <SettingRow label="Review reminders" detail="A reminder after a completed visit" value={preferences.review_reminders} onPress={() => void update('review_reminders')} />
      <SettingRow label="ROVAH updates" detail="Optional product and community updates" value={preferences.product_updates} onPress={() => void update('product_updates')} />
      <SettingRow label="Local promotions" detail="Optional nearby private-space offers from ROVAH hosts" value={preferences.local_promotions} onPress={() => void update('local_promotions')} last />
    </View>}
    <View style={styles.section}><Text style={styles.sectionTitle}>Privacy & help</Text>
      <Pressable onPress={() => router.push('/support' as never)} style={styles.linkRow}><Text style={styles.linkText}>Help, support, and report an issue</Text><Text style={styles.chevron}>›</Text></Pressable>
      <Pressable onPress={() => router.push('/legal' as never)} style={styles.linkRow}><Text style={styles.linkText}>Legal Library</Text><Text style={styles.chevron}>›</Text></Pressable>
    </View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Account</Text><Pressable onPress={() => router.push('/delete-account' as never)} style={styles.linkRow}><View><Text style={styles.deleteText}>Delete my ROVAH account</Text><Text style={styles.rowDetail}>Request permanent removal of your account and personal data</Text></View><Text style={styles.chevron}>{'\u203A'}</Text></Pressable></View>
    <HostPageGuide
      title="How to use Settings & Privacy"
      intro="Choose the notifications and account tools that work best for you."
      tone="forest"
      steps={[
        { title: 'Choose reservation updates', text: 'Keep Reservation updates on if you want confirmation, change, and cancellation notices.' },
        { title: 'Choose message updates', text: 'Keep Message updates on to receive notices when a host sends you a new message.' },
        { title: 'Use privacy and help links', text: 'Open Help for support or reporting, and Legal Library for the current terms, privacy, safety, pricing, and marketplace policies.' },
        { title: 'Delete an account', text: 'Use Delete my ROVAH account only when you want to permanently request removal of your account and personal data.' },
      ]}
    />
  </ScrollView></SafeAreaView>;
}

function SettingRow({ label, detail, value, onPress, last = false }: { label: string; detail: string; value: boolean; onPress: () => void; last?: boolean }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={[styles.row, last && styles.lastRow]}><View style={styles.copy}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowDetail}>{detail}</Text></View><View style={[styles.switch, value && styles.switchOn]}><View style={[styles.knob, value && styles.knobOn]} /></View></Pressable>;
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 40 }, backButton: { alignSelf: 'flex-start', marginBottom: 12, minHeight: 44, justifyContent: 'center' }, backText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 0 }, description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }, loading: { paddingVertical: 48 }, section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 20, paddingHorizontal: 16 }, sectionTitle: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 16, marginBottom: 6 }, row: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 76, paddingVertical: 12 }, lastRow: { borderBottomWidth: 0 }, copy: { flex: 1, paddingRight: 12 }, rowLabel: { color: colors.forest, fontSize: 15, fontWeight: '900' }, rowDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 }, switch: { backgroundColor: '#C9C4B7', borderRadius: 17, height: 34, justifyContent: 'center', paddingHorizontal: 3, width: 58 }, switchOn: { backgroundColor: colors.forest }, knob: { backgroundColor: colors.warmWhite, borderRadius: 14, height: 28, width: 28 }, knobOn: { alignSelf: 'flex-end' }, linkRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58 }, linkText: { color: colors.forest, fontSize: 15, fontWeight: '800' }, deleteText: { color: colors.red, fontSize: 15, fontWeight: '900' }, chevron: { color: colors.brown, fontSize: 28, fontWeight: '600' } });
