import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { legalDocumentBySlug } from '../lib/legal-content';
import { supabase } from '../lib/supabase';

type LegalSlug = 'terms-of-service' | 'liability-waiver-release';

export default function LegalAcceptanceScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [activeDocument, setActiveDocument] = useState<LegalSlug | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; document_title: string; document_version: string; accepted_at: string }>>([]);

  useEffect(() => {
    const loadHistory = async () => {
      const { data } = await supabase
        .from('user_legal_acceptances')
        .select('id, document_title, document_version, accepted_at')
        .order('accepted_at', { ascending: false })
        .limit(8);
      if (data) setHistory(data);
    };
    void loadHistory();
  }, []);

  const complete = legalAccepted;
  const accept = async () => {
    if (!complete) {
      Alert.alert('Review the agreements', 'Read the Terms and Liability Waiver, then select the required agreement before continuing.');
      return;
    }
    try {
      setIsSaving(true);
      setSaveError(null);
      const { data, error } = await supabase.functions.invoke('accept-legal-agreements', {
        body: {
          // A single customer-facing acceptance is recorded as acceptance of
          // both complete documents and the related age/release acknowledgement.
          termsAccepted: true,
          waiverAcknowledged: true,
          adultCertified: true,
          releaseAcknowledged: true,
          clientAcceptedAt: new Date().toISOString(),
          clientPlatform: Platform.OS,
        },
      });
      if (error) {
        const response = (error as Error & { context?: Response }).context;
        const message = response ? (await response.clone().json().catch(() => ({})) as { error?: string }).error : null;
        throw new Error(message ?? error.message);
      }
      if (!data?.accepted) throw new Error('The acceptance record could not be confirmed.');
      // The server response records the acceptance. Return immediately instead
      // of waiting for a mobile-style alert that may not appear on web.
      router.replace((typeof returnTo === 'string' && returnTo.startsWith('/')) ? returnTo as never : '/dashboard');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'We could not record your acceptance. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const checkbox = (checked: boolean, onPress: () => void, children: React.ReactNode) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkRow}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkmark}>✓</Text> : null}</View>
      <View style={styles.checkCopy}>{children}</View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>ROVAH LEGAL ACCEPTANCE</Text>
        <Text style={styles.title}>One agreement before your next reservation</Text>
        <Text style={styles.lead}>ROVAH connects dog owners with independently hosted private spaces. Dogs and outdoor property have inherent risks. Hosts may add property-specific rules that supplement these agreements.</Text>

        <View style={styles.card}>
          <View style={styles.documentLinksRow}>
            <Text onPress={() => setActiveDocument('terms-of-service')} style={styles.link}>Read Terms</Text>
            <Text style={styles.linkDivider}>•</Text>
            <Text onPress={() => setActiveDocument('liability-waiver-release')} style={styles.link}>Read Waiver</Text>
          </View>
          {checkbox(legalAccepted, () => setLegalAccepted((value) => !value), <Text style={styles.checkText}>I am at least 18 years old and agree to the ROVAH Terms of Service and Liability Waiver and Release, including the assumption of risk, release of liability, and indemnification provisions.</Text>)}
        </View>

        <Pressable accessibilityRole="button" disabled={!complete || isSaving} onPress={() => void accept()} style={[styles.primaryButton, (!complete || isSaving) && styles.disabled]}>
          {isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.primaryButtonText}>Accept Current Agreements</Text>}
        </Pressable>
        {saveError ? <Text accessibilityRole="alert" style={styles.errorText}>{saveError}</Text> : null}

        {history.length ? <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>Your agreement history</Text>
          {history.map((record) => <Text key={record.id} style={styles.historyText}>{record.document_title} · version {record.document_version} · {new Date(record.accepted_at).toLocaleDateString()}</Text>)}
        </View> : null}
      </ScrollView>

      <Modal animationType="slide" transparent visible={activeDocument !== null} onRequestClose={() => setActiveDocument(null)}>
        <View style={styles.modalBackdrop}><View style={styles.modal}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{activeDocument ? legalDocumentBySlug[activeDocument]?.title : ''}</Text><Pressable onPress={() => setActiveDocument(null)} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalContent}>{activeDocument ? legalDocumentBySlug[activeDocument]?.sections.map((section) => <View key={section.heading} style={styles.modalSection}><Text style={styles.modalSectionTitle}>{section.heading}</Text>{section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.modalText}>{paragraph}</Text>)}</View>) : null}</ScrollView>
          <Pressable onPress={() => setActiveDocument(null)} style={styles.returnButton}><Text style={styles.returnButtonText}>Return to Acceptance</Text></Pressable>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.cream, flex: 1 },
  container: { gap: 12, padding: 20, paddingBottom: 42 },
  eyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.forest, fontSize: 28, fontWeight: '900', lineHeight: 34 },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: '#FFF9EF', borderColor: '#D9C49D', borderRadius: 18, borderWidth: 1, gap: 12, padding: 16 },
  checkRow: { alignItems: 'flex-start', flexDirection: 'row' },
  checkbox: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.brown, borderRadius: 4, borderWidth: 1.5, height: 22, justifyContent: 'center', marginRight: 10, marginTop: 1, width: 22 },
  checkboxChecked: { backgroundColor: colors.forest, borderColor: colors.forest },
  checkmark: { color: colors.warmWhite, fontSize: 15, fontWeight: '900', lineHeight: 18 },
  checkCopy: { flex: 1 },
  checkText: { color: colors.forest, fontSize: 14, lineHeight: 21 },
  link: { color: colors.brown, fontWeight: '900', textDecorationLine: 'underline' },
  documentLinksRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  linkDivider: { color: colors.muted, fontSize: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', minHeight: 54 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  errorText: { color: '#8B2D2D', fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  disabled: { opacity: 0.45 },
  historyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 6, padding: 15 },
  historyTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  historyText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  modalBackdrop: { backgroundColor: 'rgba(23, 34, 20, 0.62)', flex: 1, justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', paddingBottom: 24 },
  modalHeader: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16 },
  modalTitle: { color: colors.forest, flex: 1, fontSize: 19, fontWeight: '900', marginRight: 12 },
  close: { alignItems: 'center', borderColor: colors.forest, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 },
  closeText: { color: colors.forest, fontSize: 13, fontWeight: '900' },
  modalContent: { padding: 20 },
  modalSection: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 14 },
  modalSectionTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  modalText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  returnButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 13, justifyContent: 'center', marginHorizontal: 20, minHeight: 50 },
  returnButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
});
