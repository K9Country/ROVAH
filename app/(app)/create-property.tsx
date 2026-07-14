import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreatePropertyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconBadge}>
          <Text style={styles.icon}>🏡</Text>
        </View>

        <Text style={styles.title}>You’re ready to create a property</Text>

        <Text style={styles.description}>
          Your host profile is saved. Next, we’ll collect the details guests
          need to book confidently: photos, fencing, access, rules, pricing,
          and availability.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/host')}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Review Host Profile</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/dashboard')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Back to Dashboard</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4ECDD' },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconBadge: {
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: 41,
    backgroundColor: '#E8ECDD',
    marginBottom: 24,
  },
  icon: { fontSize: 40 },
  title: {
    color: '#263A24',
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    color: '#6D6A60',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 30,
  },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#263A24',
  },
  primaryButtonText: { color: '#FFFDF8', fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { color: '#8A4F17', fontSize: 15, fontWeight: '800' },
  buttonPressed: { opacity: 0.78 },
});
