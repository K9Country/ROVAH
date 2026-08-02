import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { useAuth } from '../services/auth-context';

type BenefitInfo = {
  key: 'private-spaces' | 'happier-dogs' | 'stronger-community' | 'extra-income';
  title: string;
  subtitle: string;
  paragraphs: string[];
  sections?: { title: string; items: string[] }[];
};

const benefits: BenefitInfo[] = [
  {
    key: 'private-spaces',
    title: 'Private Spaces',
    subtitle: 'A Place Where Dogs Can Truly Be Dogs',
    paragraphs: [
      'ROVAH connects dog owners with privately owned properties where dogs can safely run, explore, sniff, train, and play without the stress of crowded public parks.',
      'Whether you are looking for a large fenced yard, open acreage, wooded trails, or a quiet place for training, every property offers a unique experience.',
      'Every listing includes photos, property details, amenities, availability, pricing, and host information so you know exactly what to expect before you arrive.',
      'ROVAH makes finding safe outdoor space simple—giving dogs the freedom they deserve while giving owners peace of mind.',
    ],
    sections: [
      { title: 'Private spaces are especially valuable for', items: ['Reactive or anxious dogs', 'Puppies learning confidence', 'Senior dogs needing peaceful exercise', 'Dogs recovering from injury', 'Families wanting a private outing', 'Owners who simply enjoy having space to themselves'] },
      { title: 'Amenities may include', items: ['Fully fenced yards', 'Open fields', 'Walking trails', 'Water stations', 'Shade structures', 'Seating areas', 'Toys and agility equipment', 'Parking', 'Multiple play areas'] },
    ],
  },
  {
    key: 'happier-dogs',
    title: 'Happier Dogs',
    subtitle: 'Exercise, Enrichment, and Better Health',
    paragraphs: [
      'Dogs thrive when they have room to move, explore, and use their natural instincts.',
      'Regular off-leash exercise provides far more than physical activity—it improves overall health, confidence, and behavior.',
      'Every dog is different. Some enjoy chasing balls across open fields. Others simply enjoy quietly exploring new scents or relaxing beside their owner.',
      'ROVAH gives every dog the opportunity to enjoy outdoor experiences that match their personality and comfort level. A happier dog often means a happier owner.',
    ],
    sections: [{ title: 'Benefits often include', items: ['Reduced anxiety and stress', 'Better physical fitness', 'Mental stimulation through exploration', 'Improved obedience and focus', 'Healthier weight', 'Better social experiences', 'Reduced destructive behavior at home', 'Improved quality of life'] }],
  },
  {
    key: 'stronger-community',
    title: 'Stronger Community',
    subtitle: 'Connecting People Through Their Love of Dogs',
    paragraphs: [
      'ROVAH is more than a place to reserve private dog spaces. It is a growing community built around responsible dog ownership and shared experiences.',
      'Hosts can welcome visitors to their properties while creating new friendships with fellow dog lovers. Guests discover unique places, support local property owners, and enjoy experiences that are not available in traditional dog parks.',
      'ROVAH is designed to strengthen connections between people while creating more opportunities for dogs to enjoy safe outdoor adventures.',
      'Together, we are building a community centered on trust, respect, and a shared love for dogs.',
    ],
    sections: [{ title: 'As the community grows, members will be able to', items: ['Follow favorite hosts', 'Receive updates on new spaces', 'Share reviews and experiences', 'Return to favorite locations', 'Discover new properties nearby', 'Support local hosts and small property owners'] }],
  },
  {
    key: 'extra-income',
    title: 'Extra Income',
    subtitle: 'Turn Your Property Into Additional Income',
    paragraphs: [
      'If you have land that dogs would enjoy, ROVAH makes it easy to share your space and earn extra income on your schedule.',
      'You stay in complete control. ROVAH provides the technology to help manage reservations, payments, communication, and guest experiences so you can focus on your property.',
      'Many hosts use ROVAH to generate income from spaces that would otherwise sit unused.',
      'Whether you are looking to earn a little extra each month or maximize the value of your property, ROVAH provides an easy way to connect with dog owners looking for safe, private outdoor spaces.',
    ],
    sections: [
      { title: 'You decide', items: ['When your property is available', 'Your hourly price', 'Which amenities you offer', 'How many dogs are allowed', 'Your booking rules', 'Your availability calendar'] },
      { title: 'Great spaces include', items: ['Large fenced backyards', 'Rural properties', 'Open fields', 'Wooded acreage', 'Hobby farms', 'Private trails'] },
    ],
  },
];

export default function ChoosePathScreen() {
  const { isHost, isLoading, isMember, session } = useAuth();
  const [selectedBenefit, setSelectedBenefit] = useState<BenefitInfo | null>(null);
  const [showLaunchIntro, setShowLaunchIntro] = useState(true);
  const launchPlayer = useVideoPlayer(require('../assets/videos/rovah-launch-intro.mp4'), (player) => {
    player.muted = true;
  });
  useEventListener(launchPlayer, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      launchPlayer.muted = true;
      void launchPlayer.play();
    }
  });
  useEventListener(launchPlayer, 'playToEnd', () => setShowLaunchIntro(false));
  useEffect(() => {
    if (isLoading || !session) return;
    if (isHost) {
      router.replace('/host-dashboard' as never);
      return;
    }
    if (isMember) router.replace('/dashboard' as never);
  }, [isHost, isLoading, isMember, session]);

  const openMemberPath = () => {
    if (isLoading) return;
    if (session && isMember) {
      router.replace('/dashboard' as never);
      return;
    }

    router.replace('/sign-in?intent=member' as never);
  };

  const openHostPath = () => {
    router.replace(isHost ? '/host-dashboard' : '/sign-in?intent=host');
  };
  const benefitHotspotStyles = [
    styles.benefitHotspot1,
    styles.benefitHotspot2,
    styles.benefitHotspot3,
    styles.benefitHotspot4,
  ];

  if (!isLoading && !session && showLaunchIntro) {
    return <SafeAreaView style={styles.launchSafeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.launchIntro}>
        <VideoView contentFit="cover" nativeControls={false} player={launchPlayer} style={styles.launchVideo} />
        <Pressable accessibilityLabel="Skip introduction" accessibilityRole="button" onPress={() => setShowLaunchIntro(false)} style={styles.skipIntroButton}>
          <Text style={styles.skipIntroText}>Skip</Text>
        </Pressable>
      </View>
    </SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.artworkContainer}>
          <Image
            accessibilityLabel="ROVAH member and host options"
            contentFit="contain"
            source={require('../assets/images/rovah-path-picker.png')}
            style={styles.artwork}
          />

          <Pressable
            accessibilityHint="Opens space search or member sign in"
            accessibilityLabel="Find a Space"
            accessibilityRole="button"
            onPress={openMemberPath}
            style={({ pressed }) => [styles.findSpaceButton, pressed && styles.buttonPressed]}
          />

          <Pressable
            accessibilityHint="Opens the host dashboard or host sign in"
            accessibilityLabel="Manage My Property"
            accessibilityRole="button"
            onPress={openHostPath}
            style={({ pressed }) => [styles.managePropertyButton, pressed && styles.buttonPressed]}
          />

          <View pointerEvents="none" style={styles.artworkFadeBlend} />
        </View>

        <View style={styles.benefitsSection}>
          <Image
            accessibilityLabel="ROVAH benefits for dogs, members, hosts, and the community"
            contentFit="contain"
            source={require('../assets/images/rovah-path-picker-benefits.png')}
            style={styles.benefitsArtwork}
          />
          {benefits.map((benefit, index) => (
            <Pressable
              accessibilityHint={`Opens more information about ${benefit.title}`}
              accessibilityLabel={`Learn about ${benefit.title}`}
              accessibilityRole="button"
              key={benefit.key}
              onPress={() => setSelectedBenefit(benefit)}
              style={({ pressed }) => [styles.benefitHotspot, benefitHotspotStyles[index], pressed && styles.buttonPressed]}
            />
          ))}
        </View>

        <View pointerEvents="none" style={styles.artworkDivider} />

        <View style={styles.informationSection}>
          <Pressable accessibilityRole="link" onPress={() => router.push('/legal' as never)} style={styles.informationLink}>
            <Text style={styles.informationLinkTitle}>Legal Library</Text>
            <Text style={styles.informationLinkText}>Terms, privacy, safety, pricing, and marketplace policies</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => router.push('/admin-sign-in' as never)} style={styles.administratorLink}>
            <Text style={styles.administratorLinkText}>Administrator sign in</Text>
          </Pressable>
        </View>

      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedBenefit(null)}
        transparent
        visible={Boolean(selectedBenefit)}
      >
        <View style={styles.benefitModalBackdrop}>
          <View style={styles.benefitModalCard}>
            {selectedBenefit ? <>
              <View style={styles.benefitModalHeading}>
                <View style={styles.benefitModalHeadingCopy}>
                  <Text style={styles.benefitModalTitle}>{selectedBenefit.title}</Text>
                  <Text style={styles.benefitModalSubtitle}>{selectedBenefit.subtitle}</Text>
                </View>
                <Pressable accessibilityLabel="Close information" accessibilityRole="button" onPress={() => setSelectedBenefit(null)} style={styles.benefitModalClose}>
                  <Text style={styles.benefitModalCloseText}>×</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.benefitModalContent} showsVerticalScrollIndicator>
                {selectedBenefit.paragraphs.slice(0, 2).map((paragraph) => <Text key={paragraph} style={styles.benefitModalParagraph}>{paragraph}</Text>)}
                {selectedBenefit.sections?.map((section) => <View key={section.title} style={styles.benefitModalSection}>
                  <Text style={styles.benefitModalSectionTitle}>{section.title}</Text>
                  {section.items.map((item) => <View key={item} style={styles.benefitModalBulletRow}><Text style={styles.benefitModalBullet}>•</Text><Text style={styles.benefitModalBulletText}>{item}</Text></View>)}
                </View>)}
                {selectedBenefit.paragraphs.slice(2).map((paragraph) => <Text key={paragraph} style={styles.benefitModalParagraph}>{paragraph}</Text>)}
                <Pressable accessibilityRole="button" onPress={() => setSelectedBenefit(null)} style={styles.benefitModalDone}><Text style={styles.benefitModalDoneText}>Close</Text></Pressable>
              </ScrollView>
            </> : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  launchSafeArea: { backgroundColor: colors.forest, flex: 1 },
  launchIntro: { backgroundColor: colors.forest, flex: 1 },
  launchVideo: { flex: 1, width: '100%' },
  skipIntroButton: { alignSelf: 'center', backgroundColor: 'rgba(255, 255, 255, 0.82)', borderRadius: 18, bottom: 28, minHeight: 38, paddingHorizontal: 18, paddingVertical: 9, position: 'absolute' },
  skipIntroText: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  safeArea: {
    backgroundColor: '#F1E1C8',
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  artworkContainer: {
    aspectRatio: 4 / 5,
    position: 'relative',
    width: '100%',
  },
  artwork: {
    height: '100%',
    width: '100%',
  },
  benefitsSection: {
    backgroundColor: '#F1E1C8',
    position: 'relative',
    width: '100%',
  },
  benefitsArtwork: {
    aspectRatio: 943 / 528,
    width: '100%',
  },
  benefitHotspot: { bottom: '27%', position: 'absolute', top: '22%', zIndex: 1 },
  benefitHotspot1: { left: '1%', right: '76%' },
  benefitHotspot2: { left: '26%', right: '51%' },
  benefitHotspot3: { left: '51%', right: '26%' },
  benefitHotspot4: { left: '76%', right: '1%' },
  artworkDivider: { backgroundColor: '#704821', height: 4, width: '100%' },
  informationSection: { paddingBottom: 26, paddingHorizontal: 24, paddingTop: 12 },
  informationLink: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  informationLinkTitle: { color: colors.forest, fontSize: 15, fontWeight: '900', textDecorationLine: 'underline' },
  informationLinkText: { color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  administratorLink: { alignItems: 'center', paddingBottom: 4, paddingTop: 10 },
  administratorLinkText: { color: colors.muted, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  findSpaceButton: {
    bottom: '21.4%',
    left: '16%',
    position: 'absolute',
    right: '16%',
    top: '71%',
    zIndex: 1,
  },
  managePropertyButton: {
    bottom: '4.2%',
    left: '57%',
    position: 'absolute',
    right: '9%',
    top: '86.5%',
    zIndex: 1,
  },
  artworkFadeBlend: {
    backgroundColor: '#F1E1C8',
    bottom: 0,
    height: 6,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  buttonPressed: {
    opacity: 0.62,
  },
  benefitModalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(18, 34, 23, 0.62)', flex: 1, justifyContent: 'center', padding: 18 },
  benefitModalCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 24, borderWidth: 1, maxHeight: '86%', maxWidth: 520, overflow: 'hidden', width: '100%' },
  benefitModalHeading: { alignItems: 'flex-start', backgroundColor: colors.lightGreen, borderBottomColor: '#CBD1BD', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 18 },
  benefitModalHeadingCopy: { flex: 1, paddingRight: 8 },
  benefitModalTitle: { color: colors.forest, fontSize: 25, fontWeight: '900', lineHeight: 30 },
  benefitModalSubtitle: { color: colors.brown, fontSize: 14, fontWeight: '800', lineHeight: 20, marginTop: 5 },
  benefitModalClose: { alignItems: 'center', borderColor: colors.forest, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  benefitModalCloseText: { color: colors.forest, fontSize: 27, fontWeight: '400', lineHeight: 30 },
  benefitModalContent: { padding: 20, paddingBottom: 26 },
  benefitModalParagraph: { color: colors.muted, fontSize: 15, lineHeight: 23, marginBottom: 15 },
  benefitModalSection: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginBottom: 16, padding: 15 },
  benefitModalSectionTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', lineHeight: 22, marginBottom: 9 },
  benefitModalBulletRow: { flexDirection: 'row', marginTop: 5 },
  benefitModalBullet: { color: colors.brown, fontSize: 16, fontWeight: '900', lineHeight: 21, marginRight: 8 },
  benefitModalBulletText: { color: colors.muted, flex: 1, fontSize: 14, lineHeight: 21 },
  benefitModalDone: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 5, minHeight: 50 },
  benefitModalDoneText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
});
