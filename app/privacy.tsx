import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../constants/theme';

type PolicySection = {
  number: string;
  title: string;
  body: string;
};

function formatPolicyText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/Ã¢â‚¬â„¢/g, '’')
    .replace(/Ã¢â‚¬Å“/g, '“')
    .replace(/Ã¢â‚¬Â/g, '”')
    .replace(/Ã¢â‚¬â€œ/g, '–')
    .replace(/Ã¢â‚¬â€/g, '—');
}

function splitPolicy(value: string) {
  const normalized = formatPolicyText(value).trim();
  const matches = [...normalized.matchAll(/^(\d+)\.\s+(.+)$/gm)];
  if (matches.length === 0) return { introduction: normalized, sections: [] as PolicySection[] };

  const introduction = normalized.slice(0, matches[0].index).trim();
  const sections = matches.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = index < matches.length - 1 ? matches[index + 1].index ?? normalized.length : normalized.length;
    return { number: match[1], title: match[2], body: normalized.slice(bodyStart, bodyEnd).trim() };
  });

  return { introduction, sections };
}

function PolicyBody({ body }: { body: string }) {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0);

  return (
    <View style={styles.policyBody}>
      {blocks.map((lines, blockIndex) => {
        const isList = lines.filter((line) => line.endsWith(';')).length >= 2;

        if (isList) {
          return (
            <View key={`list-${blockIndex}`} style={styles.bulletList}>
              {lines.map((line) => (
                <View key={line} style={styles.bulletItem}>
                  <View style={styles.bullet} />
                  <Text style={styles.bulletText}>{line.replace(/[;.]+$/, '')}</Text>
                </View>
              ))}
            </View>
          );
        }

        return (
          <View key={`copy-${blockIndex}`} style={styles.copyBlock}>
            {lines.map((line) => (
              <Text
                key={line}
                style={/^[A-Z]\./.test(line) ? styles.subheading : styles.sectionBody}
              >
                {line}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default function PrivacyScreen() {
  const [policy, setPolicy] = useState('');
  const [error, setError] = useState(false);
  const { introduction, sections } = useMemo(() => splitPolicy(policy), [policy]);

  useEffect(() => {
    fetch('/privacy-policy.txt')
      .then((response) => response.ok ? response.text() : Promise.reject(new Error('Privacy policy unavailable')))
      .then(setPolicy)
      .catch(() => setError(true));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Privacy Policy' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/choose-path')} style={styles.backButton}>
          <Text style={styles.backButtonText}>Return to Start Page</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PRIVACY</Text>
          <Text style={styles.title}>Your information.{`\n`}Handled with care.</Text>
          <Text style={styles.heroText}>ROVAH is committed to explaining how information is collected, used, and protected in clear, accessible language.</Text>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>EFFECTIVE</Text>
            <Text style={styles.dateValue}>July 18, 2026</Text>
          </View>
        </View>

        {!policy && !error ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : null}
        {error ? <View style={styles.error}><Text style={styles.errorText}>The privacy policy could not be loaded. Please try again later.</Text></View> : null}

        {policy ? <>
          <View style={styles.introCard}>
            <Text style={styles.introLabel}>AT A GLANCE</Text>
            <Text style={styles.introText}>{introduction}</Text>
            <View style={styles.introDivider} />
            <Text style={styles.introFooter}>{sections.length} policy topics · Last updated July 18, 2026</Text>
          </View>

          <Text style={styles.sectionHeading}>Privacy Policy</Text>
          <Text style={styles.sectionIntro}>Review each topic below. Key information is organized into easy-to-scan sections.</Text>
          {sections.map((section, index) => <View key={section.number} style={[styles.sectionCard, index % 3 === 1 && styles.sectionCardWarm, index % 3 === 2 && styles.sectionCardGreen]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNumber}>{section.number.padStart(2, '0')}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <PolicyBody body={section.body} />
          </View>)}

          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Questions about privacy?</Text>
            <Text style={styles.contactText}>Email support@rovah.dog and our team will help with your privacy question or request.</Text>
          </View>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream, userSelect: 'none' },
  container: { padding: 20, paddingBottom: 44 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', marginBottom: 8, minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  hero: { backgroundColor: colors.forest, borderRadius: 24, padding: 22 },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: colors.warmWhite, fontFamily: typography.display, fontSize: 31, fontWeight: '900', lineHeight: 37 },
  heroText: { color: '#E4EDE0', fontSize: 15, lineHeight: 22, marginTop: 14 },
  dateRow: { alignItems: 'center', borderTopColor: 'rgba(228, 237, 224, 0.32)', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 14 },
  dateLabel: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  dateValue: { color: colors.warmWhite, fontSize: 13, fontWeight: '800' },
  loading: { paddingVertical: 48 },
  error: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 16, borderWidth: 1, marginTop: 20, padding: 16 },
  errorText: { color: colors.red, fontSize: 14, lineHeight: 20 },
  introCard: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 18 },
  introLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginBottom: 8 },
  introText: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  introDivider: { backgroundColor: '#E7C79D', height: 1, marginVertical: 16 },
  introFooter: { color: colors.forest, fontSize: 13, fontWeight: '800' },
  sectionHeading: { color: colors.forest, fontFamily: typography.display, fontSize: 23, fontWeight: '900', lineHeight: 29, marginBottom: 4, marginTop: 28 },
  sectionIntro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  sectionCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginBottom: 12, padding: 17 },
  sectionCardWarm: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D' },
  sectionCardGreen: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6' },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 11 },
  sectionNumber: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, marginRight: 12, marginTop: 3 },
  sectionTitle: { color: colors.forest, flex: 1, fontSize: 18, fontWeight: '900', lineHeight: 23 },
  policyBody: { gap: 14 },
  copyBlock: { gap: 8 },
  sectionBody: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  subheading: { color: colors.forest, fontSize: 16, fontWeight: '900', lineHeight: 22 },
  bulletList: { gap: 9 },
  bulletItem: { alignItems: 'flex-start', flexDirection: 'row' },
  bullet: { backgroundColor: colors.brown, borderRadius: 4, height: 8, marginRight: 11, marginTop: 7, width: 8 },
  bulletText: { color: colors.muted, flex: 1, fontSize: 15, lineHeight: 22 },
  contactCard: { backgroundColor: colors.olive, borderRadius: 20, marginTop: 6, padding: 20 },
  contactTitle: { color: colors.gold, fontSize: 20, fontWeight: '900' },
  contactText: { color: '#F1F0DA', fontSize: 15, lineHeight: 22, marginTop: 8 },
});
