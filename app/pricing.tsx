import { Stack, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../constants/theme';

const memberBenefits = [
  'Exclusive use of the property during your reserved time.',
  'Secure online booking.',
  'Reservation confirmation and reminders.',
  'Private in-app messaging with your host.',
  'Verified reviews from real ROVAH members.',
];

const hostControls = [
  'Your hourly rental rate.',
  'Your available booking schedule.',
  'Your property rules.',
  'The amenities you provide.',
];

const hostFeeBenefits = [
  'Secure payment processing.',
  'Online booking and calendar management.',
  'Private member-to-host messaging.',
  'Verified member reviews.',
  'Reservation management.',
  'Website and mobile app maintenance.',
  'Ongoing improvements and new features.',
];

const hostReasons = [
  'Earn income from your property.',
  'Set your own prices.',
  'Choose when you’re available.',
  'Create your own property rules.',
  'Share your space with a trusted community of dog lovers.',
];

export default function PricingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Pricing' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/choose-path')} style={styles.backButton}>
          <Text style={styles.backButtonText}>Return to Start Page</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PRICING</Text>
          <Text style={styles.title}>Simple. Fair.{`\n`}Transparent.</Text>
          <Text style={styles.heroText}>At ROVAH, we believe pricing should be easy to understand. There are no membership fees, no hidden charges, and no surprise costs.</Text>
          <Text style={styles.heroText}>Whether you’re looking for a private place for your dog to play or opening your property to fellow dog lovers, joining ROVAH is completely free.</Text>
        </View>

        <Text style={styles.sectionHeading}>For Members</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>It’s Free to Join</Text>
          <Text style={styles.bodyText}>Creating a ROVAH member account is completely free.</Text>
          <BulletList items={['No membership fees.', 'No monthly subscriptions.', 'No hidden charges.']} />
          <Text style={styles.bodyText}>You only pay when you reserve a private dog park.</Text>
          <View style={styles.cardDivider} />
          <Text style={styles.cardTitle}>What You Pay</Text>
          <Text style={styles.bodyText}>When you make a reservation, you simply pay:</Text>
          <BulletList items={["The host's hourly rental rate.", 'Any applicable taxes required by law.']} />
          <Text style={styles.bodyText}>Your reservation gives you exclusive access to the property during your scheduled visit.</Text>
        </View>

        <View style={styles.highlightCard}>
          <Text style={styles.cardTitle}>Every Reservation Includes</Text>
          <BulletList items={memberBenefits} dark />
        </View>

        <Text style={styles.sectionHeading}>For Hosts</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>It’s Free to Join</Text>
          <Text style={styles.bodyText}>Creating a host account and listing your property is completely free.</Text>
          <BulletList items={['No membership fees.', 'No monthly subscriptions.', 'No listing fees.', 'No setup fees.', 'No contracts.']} />
          <Text style={styles.bodyText}>You only pay ROVAH after a completed reservation.</Text>
        </View>

        <View style={styles.hostCard}>
          <Text style={styles.cardTitle}>You’re in Control</Text>
          <Text style={styles.bodyText}>As a host, you decide:</Text>
          <BulletList items={hostControls} dark />
          <Text style={styles.bodyText}>You remain in complete control of your listing at all times.</Text>
        </View>

        <View style={styles.feeCard}>
          <Text style={styles.feeLabel}>HOST SERVICE FEE</Text>
          <Text style={styles.feeValue}>18%</Text>
          <Text style={styles.feeText}>After each successful paid reservation, ROVAH deducts its 18% Host Service Fee and Stripe deducts its actual processing fee before your payout is calculated.</Text>
          <Text style={styles.feeText}>This helps us operate, maintain, and continually improve the ROVAH marketplace while making it easy for members and hosts to connect.</Text>
        </View>

        <View style={styles.exampleCard}>
          <Text style={styles.cardTitle}>Example</Text>
          <PriceRow label="Your hourly rate" value="$20.00" />
          <PriceRow label="A member books" value="2-hour visit" />
          <View style={styles.cardDivider} />
          <PriceRow label="Reservation total" value="$40.00" emphasis />
          <PriceRow label="ROVAH Host Service Fee (18%)" value="$7.20" />
          <PriceRow label="Estimated Stripe processing fee" value="Varies by payment method" />
          <PriceRow label="Your payout" value="$32.80 less Stripe’s actual fee" emphasis />
          <Text style={styles.exampleNote}>Your final payout uses Stripe’s actual processing fee after payment succeeds.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What Your Host Service Fee Supports</Text>
          <BulletList items={hostFeeBenefits} />
        </View>

        <View style={styles.hostCard}>
          <Text style={styles.cardTitle}>Why Become a Host?</Text>
          <Text style={styles.bodyText}>If you have a safe outdoor space, it can become more than just a backyard—it can become a place where dogs can run, explore, and play while generating extra income for you.</Text>
          <Text style={styles.bodyText}>Hosting with ROVAH allows you to:</Text>
          <BulletList items={hostReasons} dark />
        </View>

        <View style={styles.commitmentCard}>
          <Text style={styles.cardTitle}>Our Commitment</Text>
          <Text style={styles.bodyText}>ROVAH succeeds when our members and hosts have great experiences. That’s why we’ve built a platform with simple pricing, complete transparency, and no unnecessary fees.</Text>
          <Text style={styles.commitmentLine}>No hidden costs.</Text>
          <Text style={styles.commitmentLine}>No long-term commitments.</Text>
          <Text style={styles.bodyText}>Just a trusted community connecting responsible dog owners with amazing private places where dogs have more space, more freedom, and more tail wags.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BulletList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={styles.bulletItem}>
          <View style={[styles.bullet, dark && styles.bulletDark]} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function PriceRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceLabel, emphasis && styles.priceEmphasis]}>{label}</Text>
      <Text style={[styles.priceValue, emphasis && styles.priceEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream, userSelect: 'none' },
  container: { padding: 20, paddingBottom: 44 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, marginBottom: 8 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  hero: { backgroundColor: colors.forest, borderRadius: 24, padding: 22 },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: colors.warmWhite, fontFamily: typography.display, fontSize: 31, fontWeight: '900', lineHeight: 37 },
  heroText: { color: '#E4EDE0', fontSize: 15, lineHeight: 22, marginTop: 14 },
  sectionHeading: { color: colors.forest, fontFamily: typography.display, fontSize: 23, fontWeight: '900', lineHeight: 29, marginBottom: 13, marginTop: 28 },
  card: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 18 },
  highlightCard: { backgroundColor: '#FFF7E9', borderColor: '#E7C79D', borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 18 },
  hostCard: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 18 },
  cardTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 9 },
  bodyText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  cardDivider: { backgroundColor: colors.border, height: 1, marginBottom: 17, marginTop: 5 },
  bulletList: { gap: 9, marginBottom: 17 },
  bulletItem: { alignItems: 'flex-start', flexDirection: 'row' },
  bullet: { backgroundColor: colors.brown, borderRadius: 4, height: 8, marginRight: 11, marginTop: 7, width: 8 },
  bulletDark: { backgroundColor: colors.forest },
  bulletText: { color: colors.muted, flex: 1, fontSize: 15, lineHeight: 21 },
  feeCard: { alignItems: 'center', backgroundColor: colors.olive, borderRadius: 20, marginBottom: 14, padding: 22 },
  feeLabel: { color: colors.cream, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  feeValue: { color: colors.gold, fontFamily: typography.display, fontSize: 54, fontWeight: '900', lineHeight: 62, marginVertical: 4 },
  feeText: { color: '#F1F0DA', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  exampleCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 18 },
  exampleNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  priceLabel: { color: colors.muted, flex: 1, fontSize: 14, lineHeight: 20, paddingRight: 12 },
  priceValue: { color: colors.forest, fontSize: 14, fontWeight: '800', lineHeight: 20, textAlign: 'right' },
  priceEmphasis: { color: colors.forest, fontWeight: '900' },
  commitmentCard: { backgroundColor: '#E7E7D0', borderColor: '#C8C9AA', borderRadius: 20, borderWidth: 1, padding: 18 },
  commitmentLine: { color: colors.forest, fontSize: 16, fontWeight: '900', marginBottom: 5 },
});
