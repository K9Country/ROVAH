import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../services/auth-context';

const hostInviteDismissalKey = '@k9-country/host-invite-dismissed-at';
const hostInviteCooldownMs = 7 * 24 * 60 * 60 * 1000;
 
export default function WelcomeScreen() {
  const { isHost, isMember } = useAuth();
  const [showHostInvite, setShowHostInvite] = useState(false);

  useEffect(() => {
    if (isHost || isMember) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void AsyncStorage.getItem(hostInviteDismissalKey).then((value) => {
      const dismissedAt = Number(value);
      const shouldShow = !Number.isFinite(dismissedAt) || Date.now() - dismissedAt >= hostInviteCooldownMs;

      if (!cancelled && shouldShow) {
        timer = setTimeout(() => setShowHostInvite(true), 1200);
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isHost, isMember]);

  const continueAsMember = () => {
    void AsyncStorage.setItem('@k9-country/host-mode', 'guest');
    router.push((isMember ? '/dashboard' : '/sign-up?intent=guest') as never);
  };

  const continueAsHost = () => {
    setShowHostInvite(false);
    void AsyncStorage.setItem('@k9-country/host-mode', 'host');
    router.push((isHost ? '/host-dashboard' : '/sign-up?intent=host') as never);
  };

  const dismissHostInvite = () => {
    setShowHostInvite(false);
    void AsyncStorage.setItem(hostInviteDismissalKey, String(Date.now()));
  };

  const signOutToSwitchProfile = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      Alert.alert('Unable to sign out', error.message);
      return;
    }

    await AsyncStorage.removeItem('@k9-country/host-mode');
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoArea}>
          <Image
            accessibilityLabel="K9 Country logo"
            contentFit="contain"
            source={require('../assets/images/k9.png')}
            style={styles.logo}
          />
        </View>
 
        {!isMember ? <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            Private outdoor space for you and your dog
          </Text>
 
          <Text style={styles.heroDescription}>
            Find and reserve secure private properties by the hour—without
            crowds, distractions, or unfamiliar dogs.
          </Text>
        </View> : null}
 
        <View style={styles.actionArea}>
          {isMember ? (
            <View style={styles.returningCard}>
              <Text style={styles.returningTitle}>Welcome back</Text>
              <Pressable accessibilityRole="button" onPress={isHost ? continueAsHost : continueAsMember} style={styles.returningDashboardLink}>
                <Text style={styles.returningDashboardLinkText}>{isHost ? 'Go to Host Dashboard' : 'Go to Member Dashboard'}</Text>
              </Pressable>
            </View>
          ) : (
          <>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>MEMBER</Text>
            <View style={styles.divider} />
          </View>
          <View style={styles.guestCard}>
            <Text style={styles.guestTitle}>I’m a Dog Owner</Text>
            <Text style={styles.guestDescription}>
              Find, reserve, and review private dog spaces built around your dog’s needs.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={continueAsMember}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isMember ? 'Go to Member Dashboard' : 'Continue as a Member'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void AsyncStorage.setItem('@k9-country/host-mode', 'guest');
                router.push('/sign-in?intent=guest' as never);
              }}
              style={({ pressed }) => [
                styles.textButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.textButtonText}>
                Member Sign In
              </Text>
            </Pressable>
          </View>
          </>
          )}

          {!isMember ? <>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>HOST</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.hostCard}>
            <Text style={styles.hostTitle}>
              Share your land. Help dogs.
            </Text>

            <Text style={styles.hostDescription}>
              Set your own availability, create your property rules, and earn
              income by offering dogs a private place to play.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={continueAsHost}
              style={({ pressed }) => [
                styles.hostButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.hostButtonText}>
                {isHost ? 'Go to Host Area' : 'Continue as a Host'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void AsyncStorage.setItem('@k9-country/host-mode', 'host');
                router.push('/sign-in?intent=host' as never);
              }}
              style={({ pressed }) => [
                styles.hostSignInButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.hostSignInButtonText}>Host Sign In</Text>
            </Pressable>
          </View>
          </> : null}
        </View>

        {isMember ? <Pressable accessibilityRole="button" onPress={() => void signOutToSwitchProfile()} style={styles.returningSignOutButton}>
          <Text style={styles.returningSignOutText}>Sign Out</Text>
        </Pressable> : null}

        {!isMember ? <View style={styles.dogNeedsSection}>
          <Text style={styles.dogNeedsTitle}>
            Perfect for Dogs Who Need Their Own Space
          </Text>
          <Text style={styles.dogNeedsIntro}>
            Not every dog thrives in crowded parks. K9 Country is ideal for
            dogs who:
          </Text>

          <View style={styles.dogNeedsList}>
            <DogNeed
              title="Prefer to Be Alone"
              description="Peaceful, private time with no other dogs."
            />
            <DogNeed
              title="Are Reactive or Anxious"
              description="A calm, controlled environment with zero surprises."
            />
            <DogNeed
              title="Need to Decompress"
              description="Perfect after boarding, travel, adoption, or stressful situations."
            />
            <DogNeed
              title="Are High Energy"
              description="Run, play, and explore without limits."
            />
            <DogNeed
              title="Are Learning & Training"
              description="Practice recall, obedience, and agility in a secure space."
            />
            <DogNeed
              title="Are Recovering or Senior"
              description="Gentle, safe exercise at their own pace."
            />
          </View>
        </View> : null}

        {!isMember ? <View style={styles.updatesCard}>
          <Text style={styles.updatesEyebrow}>K9 COUNTRY UPDATES</Text>
          <Text style={styles.updatesTitle}>What’s happening</Text>
          <Text style={styles.updatesDescription}>
            This is the shared home base for members and hosts. Check here for the latest improvements and community information.
          </Text>
          <UpdateItem title="Clearer site feedback" description="Guest reviews are now connected to the specific site that was visited." />
          <UpdateItem title="Better visit records" description="Hosts can review a guest’s track record across past site visits." />
          <UpdateItem title="One-tap directions" description="Every site can now provide an exact Google Maps destination." />
        </View> : null}
 
        {!isMember ? <Text style={styles.footer}>
          Safe spaces. Simple booking. Happier dogs.
        </Text> : null}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={dismissHostInvite}
        transparent
        visible={showHostInvite}
      >
        <View style={styles.hostInviteBackdrop}>
          <View style={styles.hostInviteCard}>
            <Text style={styles.hostInviteTitle}>Earn monthly income by sharing your land</Text>
            <Text style={styles.hostInviteText}>
              List your yard, field, or acreage for bookable dog visits. Each reservation can help create monthly income on your terms—you choose your price, availability, and site rules.
            </Text>
            <View style={styles.hostInviteBenefits}>
              <Text style={styles.hostInviteBenefit}>• Earn from bookings month after month</Text>
              <Text style={styles.hostInviteBenefit}>• Help dog families find safe private space</Text>
              <Text style={styles.hostInviteBenefit}>• Stay in control of every visit</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => { setShowHostInvite(false); router.push('/host-info' as never); }} style={styles.hostInvitePrimaryButton}>
              <Text style={styles.hostInvitePrimaryText}>Learn about hosting</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={dismissHostInvite} style={styles.hostInviteDismissButton}>
              <Text style={styles.hostInviteDismissText}>Not right now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DogNeed({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.dogNeed}>
      <View style={styles.dogNeedMarker} />
      <View style={styles.dogNeedContent}>
        <Text style={styles.dogNeedTitle}>{title}</Text>
        <Text style={styles.dogNeedDescription}>{description}</Text>
      </View>
    </View>
  );
}

function UpdateItem({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.updateItem}>
      <View style={styles.updateMarker} />
      <View style={styles.updateContent}>
        <Text style={styles.updateTitle}>{title}</Text>
        <Text style={styles.updateText}>{description}</Text>
      </View>
    </View>
  );
}
 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
 
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 30,
  },
 
  logoArea: {
    alignItems: 'center',
    marginBottom: 8,
    marginHorizontal: -24,
  },
 
  logo: {
    width: '108%',
    aspectRatio: 1.5,
  },
 
  heroCard: {
    backgroundColor: colors.warmWhite,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
 
  heroTitle: {
    color: colors.forest,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
 
  heroDescription: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
 
  actionArea: {
    gap: 12,
  },

  returningCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },

  returningTitle: {
    color: colors.forest,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
  },

  returningDashboardLink: {
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 10,
  },

  returningDashboardLinkText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  returningSignOutButton: {
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 48,
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  returningSignOutText: {
    color: colors.brown,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },

  guestCard: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },

  guestTitle: {
    color: colors.forest,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 7,
  },

  guestDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
 
  primaryButton: {
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    paddingHorizontal: 18,
  },
 
  primaryButtonText: {
    color: colors.warmWhite,
    fontSize: 17,
    fontWeight: '800',
  },

  secondaryButton: {
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brown,
    paddingHorizontal: 18,
  },
 
  secondaryButtonText: {
    color: colors.warmWhite,
    fontSize: 17,
    fontWeight: '800',
  },
 
  textButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  textButtonText: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  dogNeedsSection: {
    backgroundColor: '#E7E7D0',
    borderColor: '#C8C9AA',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 24,
    padding: 20,
  },

  dogNeedsTitle: {
    color: colors.forest,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },

  dogNeedsIntro: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },

  dogNeedsList: {
    gap: 16,
    marginTop: 20,
  },

  dogNeed: {
    flexDirection: 'row',
  },

  dogNeedMarker: {
    backgroundColor: colors.brown,
    borderRadius: 4,
    height: 8,
    marginRight: 11,
    marginTop: 7,
    width: 8,
  },

  dogNeedContent: {
    flex: 1,
  },

  dogNeedTitle: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },

  dogNeedDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },

  updatesCard: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 24,
    padding: 20,
  },

  updatesEyebrow: {
    color: colors.brown,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  updatesTitle: {
    color: colors.forest,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 5,
  },

  updatesDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  updateItem: {
    flexDirection: 'row',
    marginTop: 17,
  },

  updateMarker: {
    backgroundColor: colors.forest,
    borderRadius: 4,
    height: 8,
    marginRight: 11,
    marginTop: 6,
    width: 8,
  },

  updateContent: {
    flex: 1,
  },

  updateTitle: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
  },

  updateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
 
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
 
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
 
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
 
  dividerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginHorizontal: 12,
  },
 
  hostCard: {
    backgroundColor: colors.olive,
    borderRadius: 22,
    padding: 24,
  },
 
  hostTitle: {
    color: colors.warmWhite,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '800',
    marginBottom: 10,
  },
 
  hostDescription: {
    color: colors.cream,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 20,
  },
 
  hostButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    paddingHorizontal: 18,
  },
 
  hostButtonText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '800',
  },

  hostSignInButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 42,
  },

  hostSignInButtonText: {
    color: colors.cream,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
 
  footer: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },

  hostInviteBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 31, 17, 0.6)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },

  hostInviteCard: {
    backgroundColor: colors.warmWhite,
    borderRadius: 24,
    maxWidth: 460,
    padding: 24,
    width: '100%',
  },

  hostInviteEyebrow: {
    color: colors.brown,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    lineHeight: 16,
  },

  hostInviteTitle: {
    color: colors.forest,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 33,
    marginTop: 8,
  },

  hostInviteText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },

  hostInviteBenefits: {
    backgroundColor: colors.lightGreen,
    borderRadius: 14,
    marginTop: 18,
    padding: 14,
  },

  hostInviteBenefit: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },

  hostInvitePrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.brown,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 54,
  },

  hostInvitePrimaryText: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '900',
  },

  hostInviteDismissButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },

  hostInviteDismissText: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
