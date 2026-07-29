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
 
export default function WelcomeScreen() {
  const handleFindPrivateSpace = () => {
    Alert.alert(
      'Find a Private Space',
      'Property search will be connected in the next development phase.'
    );
  };
 
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoArea}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>K9</Text>
          </View>
 
          <Text style={styles.brandName}>K9 COUNTRY</Text>
          <Text style={styles.tagline}>PRIVATE LAND. HAPPY DOGS.</Text>
        </View>
 
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            Private outdoor space for you and your dog
          </Text>
 
          <Text style={styles.heroDescription}>
            Find and reserve secure private properties by the hour—without
            crowds, distractions, or unfamiliar dogs.
          </Text>
        </View>
 
        <View style={styles.actionArea}>
          <Pressable
            accessibilityRole="button"
            onPress={handleFindPrivateSpace}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Find a Private Space
            </Text>
          </Pressable>
 
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-up')}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              Create Member Account
            </Text>
          </Pressable>
 
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/sign-in')}
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
 
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>HOSTS</Text>
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
            onPress={() => router.push('/host-sign-up')}
            style={({ pressed }) => [
              styles.hostButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.hostButtonText}>
              Become a Host
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/host-sign-in')}
            style={styles.hostSignInButton}
          >
            <Text style={styles.hostSignInButtonText}>Host Sign In</Text>
          </Pressable>
        </View>
 
        <Text style={styles.footer}>
          Safe spaces. Simple booking. Happier dogs.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
 
const colors = {
  forest: '#263A24',
  olive: '#3D522C',
  cream: '#F4ECDD',
  warmWhite: '#FFFDF8',
  brown: '#8A4F17',
  muted: '#6D6A60',
  border: '#D7CBB8',
};
 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
 
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 30,
  },
 
  logoArea: {
    alignItems: 'center',
    marginBottom: 28,
  },
 
  logoBadge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderWidth: 5,
    borderColor: colors.brown,
    marginBottom: 14,
  },
 
  logoText: {
    color: colors.cream,
    fontSize: 42,
    fontWeight: '900',
  },
 
  brandName: {
    color: colors.forest,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
 
  tagline: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginTop: 5,
  },
 
  heroCard: {
    backgroundColor: colors.warmWhite,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
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
 
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
 
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 26,
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
});
