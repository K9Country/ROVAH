import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { memberUi } from '../../constants/member-ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

const categories = ['Safety', 'Conduct', 'Listing', 'Review', 'Message', 'Other'] as const;

export default function SupportScreen() {
  const { session } = useAuth();
  const [category, setCategory] = useState<(typeof categories)[number]>('Safety');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!session?.user.id || details.trim().length < 10) {
      Alert.alert('Add more detail', 'Please give at least a short description so our team can help.');
      return;
    }
    try {
      setIsSubmitting(true);
      const { error } = await supabase.from('member_reports').insert({ reporter_id: session.user.id, category: category.toLowerCase(), details: details.trim() });
      if (error) throw error;
      setDetails('');
      Alert.alert('Report received', 'Thank you. ROVAH will review this report. If anyone is in immediate danger, contact local emergency services.');
    } catch {
      Alert.alert('Unable to send report', 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled"><Text style={[styles.title, memberUi.pageTitle]}>Help & Support</Text><Text style={[styles.description, memberUi.pageDescription]}>Use Messages for normal trip questions. Submit a private report for safety, conduct, listing, review, or message concerns.</Text><View style={styles.emergency}><Text style={styles.emergencyTitle}>Immediate danger?</Text><Text style={styles.emergencyText}>Call local emergency services first. Do not wait for an in-app response.</Text></View><View style={styles.section}><Text style={styles.sectionTitle}>Submit a report</Text><View style={styles.categoryGrid}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categorySelected]}><Text style={[styles.categoryText, category === item && styles.categoryTextSelected]}>{item}</Text></Pressable>)}</View><TextInput multiline value={details} onChangeText={setDetails} placeholder="Tell us what happened, when it happened, and what site or person is involved." placeholderTextColor="#8A877D" style={styles.input} textAlignVertical="top" /><Pressable disabled={isSubmitting} onPress={() => void submit()} style={[styles.submitButton, isSubmitting && styles.disabled]}>{isSubmitting ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.submitText}>Send private report</Text>}</Pressable></View><View style={styles.section}><Text style={styles.sectionTitle}>Before you visit</Text><Text style={styles.tip}>• Review the site rules and arrival details.</Text><Text style={styles.tip}>• Keep all booking communication inside ROVAH.</Text><Text style={styles.tip}>• Use the exact map link only after your reservation is confirmed.</Text></View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 40 }, backButton: { alignSelf: 'flex-start', marginBottom: 12, minHeight: 44, justifyContent: 'center' }, backText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 0 }, description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }, emergency: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 16 }, emergencyTitle: { color: colors.red, fontSize: 17, fontWeight: '900' }, emergencyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 5 }, section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 16 }, sectionTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, category: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 }, categorySelected: { backgroundColor: colors.forest, borderColor: colors.forest }, categoryText: { color: colors.forest, fontSize: 13, fontWeight: '800' }, categoryTextSelected: { color: colors.warmWhite }, input: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 15, lineHeight: 21, marginTop: 16, minHeight: 130, padding: 13 }, submitButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 13, justifyContent: 'center', marginTop: 14, minHeight: 52 }, submitText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' }, disabled: { opacity: 0.6 }, tip: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 10 } });
