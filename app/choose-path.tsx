import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { useAuth } from '../services/auth-context';

export default function ChoosePathScreen() {
  const { isHost, isLoading, isMember, session } = useAuth();
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    width: '100%',
  },
  benefitsArtwork: {
    aspectRatio: 943 / 528,
    width: '100%',
  },
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
});
