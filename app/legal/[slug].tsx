import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../../constants/theme';
import { legalDocumentBySlug, legalDocuments, legalLastUpdated } from '../../lib/legal-content';

export function generateStaticParams(): { slug: string }[] {
  return legalDocuments.map((document) => ({ slug: document.slug }));
}

export default function LegalDocumentScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const document = typeof slug === 'string' ? legalDocumentBySlug[slug] : undefined;

  if (!document) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.missing}><Text style={styles.missingTitle}>Document not found</Text><Pressable onPress={() => router.replace('/legal')} style={styles.libraryButton}><Text style={styles.libraryButtonText}>Return to Legal Library</Text></Pressable></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: document.title }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/legal')} style={styles.backButton}>
          <Text style={styles.backText}>Legal Library</Text>
        </Pressable>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ROVAH LEGAL LIBRARY</Text>
          <Text style={styles.title}>{document.title}</Text>
          <Text style={styles.summary}>{document.summary}</Text>
          <Text style={styles.updated}>Last updated {legalLastUpdated}</Text>
        </View>
        <View style={styles.reviewNote}><Text style={styles.reviewText}>This baseline document describes the current ROVAH marketplace experience and is structured for later attorney review.</Text></View>
        {document.sections.map((section, index) => (
          <View key={section.heading} style={[styles.section, index % 3 === 1 && styles.warmSection, index % 3 === 2 && styles.greenSection]}>
            <Text style={styles.sectionNumber}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.sectionTitle}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}
            {section.bullets ? <View style={styles.bullets}>{section.bullets.map((bullet) => <View key={bullet} style={styles.bulletRow}><View style={styles.bullet} /><Text style={styles.bulletText}>{bullet}</Text></View>)}</View> : null}
          </View>
        ))}
        <Pressable accessibilityRole="link" onPress={() => router.replace('/legal')} style={styles.libraryButton}><Text style={styles.libraryButtonText}>Back to Legal Library</Text></Pressable>
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
  eyebrow: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.warmWhite, fontFamily: typography.display, fontSize: 29, fontWeight: '900', lineHeight: 35, marginTop: 9 },
  summary: { color: '#E4EDE0', fontSize: 15, lineHeight: 22, marginTop: 10 },
  updated: { color: colors.gold, fontSize: 12, fontWeight: '800', marginTop: 16 },
  reviewNote: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 15 },
  reviewText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 17 },
  warmSection: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D' },
  greenSection: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6' },
  sectionNumber: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', lineHeight: 24, marginTop: 5 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  bullets: { gap: 8, marginTop: 10 },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row' },
  bullet: { backgroundColor: colors.brown, borderRadius: 4, height: 8, marginRight: 10, marginTop: 7, width: 8 },
  bulletText: { color: colors.muted, flex: 1, fontSize: 15, lineHeight: 22 },
  libraryButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 50, paddingHorizontal: 18 },
  libraryButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  missing: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  missingTitle: { color: colors.forest, fontSize: 22, fontWeight: '900' },
});
