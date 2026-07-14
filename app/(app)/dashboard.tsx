import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
 
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
 
type DashboardAction = {
  title: string;
  description: string;
  icon: string;
  route?: string;
};
 
const dashboardActions: DashboardAction[] = [
{
  title: 'Find a Private Space',
  description: 'Search private properties near you.',
  icon: '🔍',
  route: '/search',
},
  {
    title: 'My Reservations',
    description: 'View upcoming and previous visits.',
    icon: '📅',
    route: '/reservations',
  },
  {
    title: 'Favorites',
    description: 'Return to properties you love.',
    icon: '♥',
    route: '/favorites',
  },
  {
    title: 'Messages',
    description: 'Communicate with property hosts.',
    icon: '💬',
    route: '/messages',
  },
  {
    title: 'Become a Host',
    description: 'Earn income from your private land.',
    icon: '🏡',
    route: '/host',
  },
  {
    title: 'Profile & Settings',
    description: 'Manage your account and preferences.',
    icon: '⚙',
    route: '/profile',
  },
];
 
export default function DashboardScreen() {
  const { session } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
 
  const fullName =
    session?.user.user_metadata?.full_name ||
    session?.user.email ||
    'K9 Country Member';
 
  const firstName = fullName.split(' ')[0];
 
  const currentHour = new Date().getHours();
 
  const greeting =
    currentHour < 12
      ? 'Good morning'
      : currentHour < 17
        ? 'Good afternoon'
        : 'Good evening';
 
  const handleNavigation = (route: string) => {
    router.push(route as never);
  };
 
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
 
      const { error } = await supabase.auth.signOut();
 
      if (error) {
        Alert.alert('Unable to sign out', error.message);
        return;
      }
 
      router.replace('/');
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not sign you out. Please try again.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };
 
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {greeting}, {firstName}
            </Text>
 
            <Text style={styles.headerDescription}>
              What would you like to do today?
            </Text>
          </View>
 
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>K9</Text>
          </View>
        </View>
 
        <Pressable
          accessibilityRole="button"
          onPress={() => handleNavigation('/search')}
          style={({ pressed }) => [
            styles.featureCard,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.featureIcon}>
            <Text style={styles.featureIconText}>🔍</Text>
          </View>
 
          <View style={styles.featureContent}>
            <Text style={styles.featureEyebrow}>START HERE</Text>
 
            <Text style={styles.featureTitle}>
              Find a private space
            </Text>
 
            <Text style={styles.featureDescription}>
              Discover secure outdoor properties where your family and dog can
              relax without crowds or unfamiliar dogs.
            </Text>
 
            <Text style={styles.featureLink}>Search properties →</Text>
          </View>
        </Pressable>
 
        <Text style={styles.sectionTitle}>Your K9 Country</Text>
 
        <View style={styles.grid}>
          {dashboardActions.slice(1).map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.title}
              onPress={() => action.route && handleNavigation(action.route)}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.cardPressed,
              ]}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
 
              <Text style={styles.actionTitle}>{action.title}</Text>
 
              <Text style={styles.actionDescription}>
                {action.description}
              </Text>
            </Pressable>
          ))}
        </View>
 
        <View style={styles.hostHighlight}>
          <View style={styles.hostHighlightText}>
            <Text style={styles.hostEyebrow}>HOST OPPORTUNITY</Text>
 
            <Text style={styles.hostTitle}>
              Have private fenced land?
            </Text>
 
            <Text style={styles.hostDescription}>
              Help dogs enjoy safe, private outdoor time while earning income
              from your property.
            </Text>
          </View>
 
          <Pressable
            accessibilityRole="button"
            onPress={() => handleNavigation('/host')}
            style={({ pressed }) => [
              styles.hostButton,
              pressed && styles.cardPressed,
            ]}
          >
            <Text style={styles.hostButtonText}>Learn About Hosting</Text>
          </Pressable>
        </View>
 
        <View style={styles.accountSection}>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
 
          <Text style={styles.accountEmail}>
            {session?.user.email}
          </Text>
 
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.cardPressed,
              isSigningOut && styles.buttonDisabled,
            ]}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#8A4F17" />
            ) : (
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            )}
          </Pressable>
        </View>
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
  lightGreen: '#E8ECDD',
};
 
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
 
  container: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
  },
 
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
 
  greeting: {
    color: colors.forest,
    fontSize: 28,
    fontWeight: '900',
  },
 
  headerDescription: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 5,
  },
 
  logoBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderWidth: 3,
    borderColor: colors.brown,
  },
 
  logoText: {
    color: colors.cream,
    fontSize: 24,
    fontWeight: '900',
  },
 
  featureCard: {
    flexDirection: 'row',
    backgroundColor: colors.forest,
    borderRadius: 22,
    padding: 20,
    marginBottom: 28,
  },
 
  featureIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    marginRight: 16,
  },
 
  featureIconText: {
    fontSize: 25,
  },
 
  featureContent: {
    flex: 1,
  },
 
  featureEyebrow: {
    color: '#D9C4A9',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 6,
  },
 
  featureTitle: {
    color: colors.warmWhite,
    fontSize: 23,
    fontWeight: '900',
    marginBottom: 8,
  },
 
  featureDescription: {
    color: colors.cream,
    fontSize: 14,
    lineHeight: 21,
  },
 
  featureLink: {
    color: '#F0B56F',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 13,
  },
 
  sectionTitle: {
    color: colors.forest,
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 14,
  },
 
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
 
  actionCard: {
    width: '48%',
    minHeight: 164,
    backgroundColor: colors.warmWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 17,
    marginBottom: 14,
  },
 
  actionIcon: {
    fontSize: 26,
    marginBottom: 13,
  },
 
  actionTitle: {
    color: colors.forest,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 7,
  },
 
  actionDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
 
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
 
  hostHighlight: {
    backgroundColor: colors.lightGreen,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD1BD',
    padding: 20,
    marginTop: 12,
  },
 
  hostHighlightText: {
    marginBottom: 18,
  },
 
  hostEyebrow: {
    color: colors.brown,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
 
  hostTitle: {
    color: colors.forest,
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 8,
  },
 
  hostDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
 
  hostButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.brown,
  },
 
  hostButtonText: {
    color: colors.warmWhite,
    fontSize: 15,
    fontWeight: '800',
  },
 
  accountSection: {
    alignItems: 'center',
    marginTop: 30,
  },
 
  accountLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
 
  accountEmail: {
    color: colors.forest,
    fontSize: 14,
    marginTop: 5,
    marginBottom: 12,
  },
 
  signOutButton: {
    minHeight: 46,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brown,
    paddingHorizontal: 22,
  },
 
  signOutButtonText: {
    color: colors.brown,
    fontSize: 15,
    fontWeight: '800',
  },
 
  buttonDisabled: {
    opacity: 0.6,
  },
});