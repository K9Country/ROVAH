import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { useAuth } from '../services/auth-context';

export default function HostInfoScreen() {
  const { isHost } = useAuth();

  const startHosting = () => {
    void AsyncStorage.setItem('@k9-country/host-mode', 'host');
    router.push((isHost ? '/host-dashboard' : '/sign-up?intent=host') as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back to welcome</Text>
        </Pressable>

        <Text style={styles.title}>Put your land to work for you.</Text>
        <Text style={styles.intro}>
          Give dog families a safe private place to visit while creating monthly income from the space you already own.
        </Text>

        <View style={styles.incomeCard}>
          <Text style={styles.incomeLabel}>HOW YOU EARN</Text>
          <Text style={styles.incomeTitle}>You keep 85% of every completed booking.</Text>
          <Text style={styles.incomeText}>
            Set your own hourly price and availability. K9 Country earns a 15% platform fee only when a guest books your site.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>You stay in control</Text>
        <Benefit title="Set your own schedule" description="Open the dates and hours that work for your life, and close your site whenever you need to." />
        <Benefit title="Create your site rules" description="Set expectations for parking, gate access, dogs, and respectful use of your space." />
        <Benefit title="Know who is visiting" description="See each guest’s profile and their host-reviewed visit record before welcoming them." />

        <View style={styles.stepsCard}>
          <Text style={styles.sectionTitle}>Getting started is simple</Text>
          <Step number="1" text="Create your host profile." />
          <Step number="2" text="Add your site, photos, exact location, rules, and availability." />
          <Step number="3" text="Welcome bookings on the schedule you choose." />
        </View>

        <Pressable accessibilityRole="button" onPress={startHosting} style={styles.primaryButton}>
          <Text style={styles.primaryText}>{isHost ? 'Go to Host Area' : 'Start Hosting'}</Text>
        </Pressable>
        <Text style={styles.note}>Income depends on your price, availability, local demand, and completed bookings.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Benefit({ title, description }: { title: string; description: string }) {
  return <View style={styles.benefit}><View style={styles.marker} /><View style={styles.benefitContent}><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitText}>{description}</Text></View></View>;
}

function Step({ number, text }: { number: string; text: string }) {
  return <View style={styles.step}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View><Text style={styles.stepText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.cream, flex: 1 },
  container: { padding: 22, paddingBottom: 42 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  title: { color: colors.forest, fontSize: 31, fontWeight: '900', lineHeight: 37, marginTop: 14 },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 12 },
  incomeCard: { backgroundColor: colors.olive, borderRadius: 20, marginTop: 24, padding: 20 },
  incomeLabel: { color: colors.cream, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  incomeTitle: { color: colors.warmWhite, fontSize: 23, fontWeight: '900', lineHeight: 29, marginTop: 8 },
  incomeText: { color: colors.cream, fontSize: 15, lineHeight: 22, marginTop: 9 },
  sectionTitle: { color: colors.forest, fontSize: 21, fontWeight: '900', marginTop: 26 },
  benefit: { flexDirection: 'row', marginTop: 17 },
  marker: { backgroundColor: colors.brown, borderRadius: 4, height: 8, marginRight: 12, marginTop: 7, width: 8 },
  benefitContent: { flex: 1 },
  benefitTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  benefitText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  stepsCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginTop: 26, padding: 19 },
  step: { alignItems: 'center', flexDirection: 'row', marginTop: 16 },
  stepNumber: { alignItems: 'center', backgroundColor: colors.lightGreen, borderRadius: 15, height: 30, justifyContent: 'center', marginRight: 11, width: 30 },
  stepNumberText: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  stepText: { color: colors.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 28, minHeight: 55 },
  primaryText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
});
