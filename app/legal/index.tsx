import { Stack, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../../constants/theme';
import { legalDocuments, legalLastUpdated } from '../../lib/legal-content';

export default function LegalLibraryScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Legal Library' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Return</Text>
        </Pressable>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ROVAH</Text>
          <Text style={styles.title}>Legal Library</Text>
          <Text style={styles.heroText}>One place for the terms, policies, safety information, and marketplace rules that apply to ROVAH.</Text>
          <Text style={styles.updated}>Last updated {legalLastUpdated}</Text>
        </View>
        <View style={styles.reviewNote}>
          <Text style={styles.reviewNoteTitle}>Prepared for legal review</Text>
          <Text style={styles.reviewNoteText}>These are plain-language baseline documents describing the current app. They should be reviewed by a qualified attorney before commercial launch.</Text>
        </View>
        <View style={styles.list}>
          {legalDocuments.map((document, index) => (
            <Pressable key={document.slug} accessibilityRole="link" onPress={() => router.push(`/legal/${document.slug}` as never)} style={({ pressed }) => [styles.documentCard, pressed && styles.pressed]}>
              <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.documentCopy}>
                <Text style={styles.documentTitle}>{document.title}</Text>
                <Text style={styles.documentSummary}>{document.summary}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.cream, flex: 1 },
  container: { padding: 20, paddingBottom: 44 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  hero: { backgroundColor: colors.forest, borderRadius: 24, marginTop: 8, padding: 22 },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.warmWhite, fontFamily: typography.display, fontSize: 32, fontWeight: '900', lineHeight: 38, marginTop: 8 },
  heroText: { color: '#E4EDE0', fontSize: 15, lineHeight: 22, marginTop: 10 },
  updated: { color: colors.gold, fontSize: 12, fontWeight: '800', marginTop: 16 },
  reviewNote: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 16 },
  reviewNoteTitle: { color: colors.brown, fontSize: 14, fontWeight: '900' },
  reviewNoteText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  list: { gap: 8, marginTop: 16 },
  documentCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', minHeight: 88, padding: 15 },
  number: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, marginRight: 12 },
  documentCopy: { flex: 1 },
  documentTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', lineHeight: 21 },
  documentSummary: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  chevron: { color: colors.brown, fontSize: 28, fontWeight: '500', marginLeft: 10 },
  pressed: { opacity: 0.72 },
});
