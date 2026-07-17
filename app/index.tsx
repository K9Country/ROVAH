import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../services/auth-context';

export default function WelcomeScreen() {
  const { isHost, isMember } = useAuth();

  const continueAsMember = () => {
    void AsyncStorage.setItem('@k9-country/host-mode', 'guest');
    router.push((isMember ? '/dashboard' : '/sign-up?intent=guest') as never);
  };

  const continueAsHost = () => {
    void AsyncStorage.setItem('@k9-country/host-mode', 'host');
    router.push((isHost ? '/host-dashboard' : '/sign-up?intent=host') as never);
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

        {!isMember ? <View style={styles.hostInvitationCard}>
          <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={styles.hostInvitationTitle}>Turn your yard into extra income</Text>
          <Pressable
            accessibilityRole="button"
            onPress={continueAsHost}
            style={({ pressed }) => [
              styles.hostInvitationButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.hostInvitationButtonText}>Learn How</Text>
          </Pressable>
        </View> : null}
 
        {!isMember ? <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            Welcome to K9 Country
          </Text>
 
          <Text style={styles.heroDescription}>
            Where dogs and their families can enjoy private outdoor adventures without the crowds.{"\n\n"}
            We’re adding new private properties across the country, welcoming new hosts, and helping more dogs discover safe places to run, explore, sniff, and simply be themselves.
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
 
        {!isMember ? <Text style={styles.footer}>
          Safe spaces for dogs to run, explore, sniff, and be themselves.
        </Text> : null}

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
          style={styles.trustSafetyLink}
        >
          <Text style={styles.trustSafetyLinkTitle}>Pricing</Text>
          <Text style={styles.trustSafetyLinkText}>
            Simple, fair, transparent pricing for members and hosts
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

  hostInvitationCard: {
    backgroundColor: colors.olive,
    borderRadius: 22,
    marginBottom: 14,
    padding: 22,
  },

  hostInvitationTitle: {
    color: colors.warmWhite,
    fontFamily: typography.display,
    fontSize: 27,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.7,
    textAlign: 'center',
  },

  hostInvitationButton: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 18,
  },

  hostInvitationButtonText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '900',
  },
 
  heroTitle: {
    color: colors.forest,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
 
  heroDescription: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
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
 
  footer: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },

  trustSafetyLink: {
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
