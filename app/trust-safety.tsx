import { Stack, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../constants/theme';

const safetyPillars = [
  {
    title: 'Secure Reservations',
    body: 'Every reservation is completed through the K9 Country platform. Payment processing is being prepared for launch; until then, reservations remain managed in one clear place for guests and hosts.',
  },
  {
    title: 'Verified Community',
    body: 'Every member creates a K9 Country account before participating. Reservation history, member profiles, and verified reviews help build a trusted community of responsible dog lovers.',
  },
  {
    title: 'Private In-App Messaging',
    body: 'Need to ask a question before your visit? Built-in messaging keeps conversations organized and helps protect personal contact information.',
  },
  {
    title: 'Honest Reviews',
    body: 'Only completed reservations are eligible for reviews, ensuring feedback comes from real experiences. Honest reviews recognize outstanding hosts and guide future guests.',
  },
  {
    title: 'Accurate Property Information',
    body: 'Hosts are encouraged to provide complete details about fencing, gate access, amenities, parking, terrain, and special instructions so guests know what to expect.',
  },
  {
    title: 'Community Standards',
    body: 'Every member agrees to treat others with courtesy, respect private property, clean up after their pets, and follow posted rules. Members who repeatedly violate community standards may lose access to K9 Country.',
  },
];

const guestChecklist = [
  'Review the property listing carefully.',
  'Read previous guest experiences.',
  'Ask questions before booking if anything is unclear.',
  'Confirm the space meets your dog’s needs.',
];

const arrivalChecklist = [
  'Walk the fenced area before unleashing your dog.',
  'Check gates and fencing for security.',
  'Identify any potential hazards.',
  'Keep your dog supervised throughout the visit.',
];

const hostChecklist = [
  'Inspect fences and gates.',
  'Remove any hazards.',
  'Prepare a clean, welcoming space.',
  'Provide accurate arrival instructions.',
  'Communicate promptly with guests.',
];

export default function TrustSafetyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Trust & Safety' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>TRUST & SAFETY</Text>
          <Text style={styles.title}>Built on Trust.{`\n`}Backed by Responsibility.</Text>
          <Text style={styles.heroText}>At K9 Country, trust isn’t just a feature—it’s the foundation of every visit.</Text>
          <Text style={styles.heroText}>We’re creating a community where responsible dog owners and welcoming property hosts can connect with confidence. Every booking is designed to promote safety, transparency, and respect for both people and pets.</Text>
          <Text style={styles.heroText}>Whether you’re opening your property or searching for a private place to let your dog run free, we’re committed to making every experience secure and enjoyable.</Text>
        </View>

        <Text style={styles.sectionHeading}>How We Help Keep Our Community Safe</Text>
        {safetyPillars.map((pillar, index) => (
          <View key={pillar.title} style={styles.pillarCard}>
            <Text style={styles.pillarNumber}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.pillarCopy}>
              <Text style={styles.pillarTitle}>{pillar.title}</Text>
              <Text style={styles.bodyText}>{pillar.body}</Text>
            </View>
          </View>
        ))}

        <View style={styles.checklistCard}>
          <Text style={styles.sectionHeading}>Before Every Visit</Text>
          <Text style={styles.checklistIntro}>We encourage every guest to:</Text>
          <Checklist items={guestChecklist} />
          <Text style={styles.checklistIntro}>Upon arrival:</Text>
          <Checklist items={arrivalChecklist} />
        </View>

        <View style={styles.hostCard}>
          <Text style={styles.sectionHeading}>Hosting with Confidence</Text>
          <Text style={styles.hostLead}>Great hosts create memorable experiences.</Text>
          <Text style={styles.checklistIntro}>Before each reservation, we recommend:</Text>
          <Checklist items={hostChecklist} />
          <Text style={styles.bodyText}>Small details—such as a well-maintained property, clear directions, and quick responses—go a long way toward earning excellent reviews.</Text>
        </View>

        <View style={styles.communityCard}>
          <Text style={styles.sectionHeading}>Growing a Trusted Community</Text>
          <Text style={styles.bodyText}>K9 Country is more than a booking platform—it’s a community of people who value safe spaces, responsible pet ownership, and respect for private property. Every reservation helps strengthen that community.</Text>
          <Text style={styles.bodyText}>Together, we’re creating more room to run, more freedom to explore, and more confidence with every visit.</Text>
          <View style={styles.communityDivider} />
          <Text style={styles.communityTitle}>Private Land. Happy Dogs.</Text>
          <Text style={styles.bodyText}>We’re adding new private properties across the country, welcoming new hosts, and helping more dogs discover safe places to run, explore, sniff, and simply be themselves.</Text>
          <Text style={styles.bodyText}>Whether your dog is energetic, reactive, anxious, in training, or just enjoys having space to roam, K9 Country is built to help you find the perfect private destination.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <View style={styles.checklist}>
      {items.map((item) => (
        <View key={item} style={styles.checklistItem}>
          <View style={styles.checkmark}><Text style={styles.checkmarkText}>✓</Text></View>
          <Text style={styles.checklistText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 44 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, marginBottom: 8 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  hero: { backgroundColor: colors.forest, borderRadius: 24, padding: 22 },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: colors.warmWhite, fontFamily: typography.display, fontSize: 31, fontWeight: '900', lineHeight: 37 },
  heroText: { color: '#E4EDE0', fontSize: 15, lineHeight: 22, marginTop: 14 },
  sectionHeading: { color: colors.forest, fontFamily: typography.display, fontSize: 23, fontWeight: '900', lineHeight: 29, marginTop: 28, marginBottom: 13 },
  pillarCard: { alignItems: 'flex-start', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginBottom: 11, padding: 16 },
  pillarNumber: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, marginRight: 12, marginTop: 3 },
  pillarCopy: { flex: 1 },
  pillarTitle: { color: colors.forest, fontSize: 17, fontWeight: '900', marginBottom: 5 },
  bodyText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  checklistCard: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 18 },
  checklistIntro: { color: colors.forest, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  checklist: { gap: 9, marginBottom: 19 },
  checklistItem: { alignItems: 'flex-start', flexDirection: 'row' },
  checkmark: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 9, height: 18, justifyContent: 'center', marginRight: 10, marginTop: 2, width: 18 },
  checkmarkText: { color: colors.warmWhite, fontSize: 12, fontWeight: '900' },
  checklistText: { color: colors.muted, flex: 1, fontSize: 15, lineHeight: 21 },
  hostCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 18 },
  hostLead: { color: colors.brown, fontSize: 16, fontWeight: '900', marginBottom: 16 },
  communityCard: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 18 },
  communityDivider: { backgroundColor: '#C4D2B6', height: 1, marginBottom: 17, marginTop: 4 },
  communityTitle: { color: colors.forest, fontSize: 20, fontWeight: '900', marginBottom: 10 },
});
