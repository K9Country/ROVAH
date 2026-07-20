import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import {
    Alert,
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

export default function WelcomeScreen() {
  const { isHost, isLoading, isMember, session } = useAuth();

  useEffect(() => {
    if (isLoading || !session) return;
    router.replace((isHost ? '/host-dashboard' : '/dashboard') as never);
  }, [isHost, isLoading, session]);

  const continueAsMember = async () => {
    router.push('/sign-up?intent=guest' as never);
  };

  const continueAsHost = async () => {
    router.push('/sign-up?intent=host' as never);
  };

  const signOutToSwitchProfile = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      Alert.alert('Unable to sign out', error.message);
      return;
    }

    router.dismissAll();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcomeArtwork}>
          <Image
            accessibilityLabel="K9 Country dog running in a private outdoor space"
            contentFit="contain"
            source={require('../assets/images/welcome-hero.png')}
            style={styles.welcomeArtworkImage}
          />
        </View>

        {!isMember ? <View style={styles.hostInvitationCard}>
          <Image
      accessibilityLabel="Host invitation panel"
      contentFit="contain"
      source={require('../assets/images/host-entry-panel-transparent.png')}
      style={styles.hostInvitationImage}
          />
          <Pressable
            accessibilityLabel="Join for Free as a host"
            accessibilityRole="button"
            onPress={() => void continueAsHost()}
            style={({ pressed }) => [
              styles.hostJoinHotspot,
              pressed && styles.buttonPressed,
            ]}
          />
          <Pressable
            accessibilityLabel="Manage My Property"
            accessibilityRole="button"
            onPress={() => {
              router.push('/sign-in?intent=host' as never);
            }}
            style={({ pressed }) => [
              styles.hostManageHotspot,
              pressed && styles.buttonPressed,
            ]}
          />
        </View> : null}

        {!isMember ? <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>MEMBER</Text>
          <View style={styles.divider} />
        </View> : null}

        {!isMember ? <Image
          accessibilityLabel="Looking for a private place for your dog"
          contentFit="contain"
          source={require('../assets/images/member-private-place.png')}
          style={styles.memberInvitationArtwork}
        /> : null}

        <View style={styles.actionArea}>
          {isMember ? (
            <View style={styles.returningCard}>
              <Text style={styles.returningTitle}>Welcome back</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace((isHost ? '/host-dashboard' : '/dashboard') as never)} style={styles.returningDashboardLink}>
                <Text style={styles.returningDashboardLinkText}>{isHost ? 'Go to Host Dashboard' : 'Go to Member Dashboard'}</Text>
              </Pressable>
            </View>
          ) : (
          <>
          <View style={styles.guestCard}>
            <Text style={styles.guestTitle}>I’m a Dog Owner</Text>
            <Text style={styles.guestDescription}>
              Find, reserve, and review private dog spaces built around your dog’s needs.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void continueAsMember()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isMember ? 'Go to Member Dashboard' : 'Continue as a New Member'}
              </Text>
            </Pressable>

            <View style={styles.memberOrDivider}>
              <View style={styles.memberOrLine} />
              <Text style={styles.memberOrText}>OR</Text>
              <View style={styles.memberOrLine} />
            </View>

            <Text style={styles.existingMemberPrompt}>Already have an account?</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                router.push('/sign-in?intent=guest' as never);
              }}
              style={({ pressed }) => [
                styles.memberSignInButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Image
                accessibilityLabel="Paw print"
                contentFit="contain"
                source={require('../assets/images/member-sign-in-paw.png')}
                style={styles.memberSignInPaw}
              />
              <Text style={styles.memberSignInText}>Member Sign In</Text>
            </Pressable>

            <View style={styles.memberBenefits}>
              <View style={styles.memberBenefit}>
                <Text style={styles.memberBenefitGraphic}>🛡️</Text>
                <Text style={styles.memberBenefitText}>Private & Secure{`\n`}Spaces</Text>
              </View>
              <View style={styles.memberBenefit}>
                <Text style={styles.memberBenefitGraphic}>📅</Text>
                <Text style={styles.memberBenefitText}>Easy Booking,{`\n`}Anytime</Text>
              </View>
              <View style={styles.memberBenefit}>
                <Text style={styles.memberBenefitGraphic}>♡</Text>
                <Text style={styles.memberBenefitText}>Happy Dogs,{`\n`}Happy Owners</Text>
              </View>
            </View>
          </View>
          </>
          )}

        </View>

        {isMember ? <Pressable accessibilityRole="button" onPress={() => void signOutToSwitchProfile()} style={styles.returningSignOutButton}>
          <Text style={styles.returningSignOutText}>Sign Out</Text>
        </Pressable> : null}

        {!isMember ? <View style={styles.dogNeedsSection}>
          <Text style={styles.dogNeedsTitle}>
            New to K9 Country?
          </Text>
          <Text style={styles.dogNeedsIntro}>
            Whether your dog is energetic, reactive, anxious, in training, or simply enjoys having space to roam, K9 Country helps you find the perfect private destination.
          </Text>

          <View style={styles.dogNeedsList}>
            <DogNeed
              title="Browse private properties near you"
              description="Discover fully fenced yards, open fields, wooded trails, and other unique spaces."
            />
            <DogNeed
              title="Book by the hour"
              description="Enjoy private outdoor time without memberships or subscriptions."
            />
            <DogNeed
              title="Meet local hosts"
              description="Connect with people offering safe, welcoming spaces for dogs."
            />
            <DogNeed
              title="Leave helpful reviews"
              description="Help other dog families discover great locations."
            />
          </View>
        </View> : null}

        {!isMember ? <View style={styles.updatesCard}>
          <Text style={styles.updatesEyebrow}>GROWING EVERY DAY</Text>
          <Text style={styles.updatesTitle}>Private Land. Happy Dogs.</Text>
          <Text style={styles.updatesDescription}>
            We’re working to build the largest network of private dog recreation spaces in North America.
          </Text>
          <UpdateItem title="New properties" description="Private spaces are being added regularly." />
          <UpdateItem title="New communities" description="More local hosts and dog families are joining K9 Country." />
          <UpdateItem title="New adventures" description="Check back often to see what’s new in your area." />
        </View> : null}
 
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/trust-safety' as never)}
          style={styles.trustSafetyLink}
        >
          <Text style={styles.trustSafetyLinkTitle}>Trust &amp; Safety</Text>
          <Text style={styles.trustSafetyLinkText}>
            How K9 Country helps keep every visit safe
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/pricing' as never)}
          style={[styles.trustSafetyLink, styles.pricingLink]}
        >
          <Text style={styles.trustSafetyLinkTitle}>Pricing</Text>
          <Text style={styles.trustSafetyLinkText}>
            Simple, fair, transparent pricing for members and hosts
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/privacy' as never)}
          style={[styles.trustSafetyLink, styles.privacyLink]}
        >
          <Text style={styles.trustSafetyLinkTitle}>Privacy Policy</Text>
          <Text style={styles.trustSafetyLinkText}>
            How K9 Country collects, uses, and protects your information
          </Text>
        </Pressable>
      </ScrollView>

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
    paddingTop: 0,
    paddingBottom: 30,
  },
 
  welcomeArtwork: {
    marginHorizontal: -24,
    marginTop: 0,
  },
 
  welcomeArtworkImage: {
    alignSelf: 'center',
    aspectRatio: 2 / 3,
    width: '108%',
  },
 
  hostInvitationCard: {
    aspectRatio: 1.5,
    marginBottom: 2,
    marginHorizontal: -24,
    marginTop: -245,
    position: 'relative',
    zIndex: 1,
  },

  hostInvitationImage: { height: '100%', width: '100%' },
  hostJoinHotspot: { bottom: '65%', left: '10%', position: 'absolute', right: '10%', top: '17%' },
  hostManageHotspot: { bottom: '26%', left: '10%', position: 'absolute', right: '10%', top: '54%' },
 
  actionArea: {
    gap: 12,
  },

  returningCard: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingTop: 8,
  },

  returningTitle: {
    color: colors.forest,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
  },

  returningDashboardLink: {
    justifyContent: 'center',
    marginTop: 20,
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
    padding: 22,
  },

  guestTitle: {
    color: colors.forest,
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 7,
    textAlign: 'center',
  },

  guestDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
    textAlign: 'center',
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
 
  memberOrDivider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },

  memberOrLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },

  memberOrText: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
  },

  existingMemberPrompt: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 20,
    textAlign: 'center',
  },

  memberSignInButton: {
    alignItems: 'center',
    borderColor: colors.forest,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },

  memberSignInPaw: {
    height: 28,
    marginRight: 12,
    width: 28,
  },

  memberSignInText: {
    color: colors.forest,
    fontSize: 17,
    fontWeight: '800',
  },

  memberBenefits: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    marginTop: 26,
    paddingTop: 20,
  },

  memberBenefit: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 4,
  },

  memberBenefitGraphic: {
    color: colors.forest,
    fontSize: 31,
    marginBottom: 8,
  },

  memberBenefitText: {
    color: colors.forest,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
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
    marginBottom: 10,
    marginTop: 8,
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

  memberInvitationArtwork: {
    aspectRatio: 1.53,
    marginBottom: 12,
    width: '100%',
  },

  trustSafetyLink: {
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  pricingLink: {
    marginTop: 6,
  },

  privacyLink: {
    marginTop: 6,
  },

  trustSafetyLinkTitle: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },

  trustSafetyLinkText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});
