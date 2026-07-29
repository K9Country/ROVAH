import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
 
import { AccountType, useAuth } from '../../services/auth-context';
 
type SignInScreenProps = {
  accountType?: AccountType;
};

export function SignInScreen({ accountType = 'member' }: SignInScreenProps) {
  const { signInAs } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
 
  const handleSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
 
    if (!normalizedEmail || !password) {
      Alert.alert('Missing information', 'Enter your email and password.');
      return;
    }
 
    try {
      setIsLoading(true);
 
      const { errorMessage } = await signInAs(
        normalizedEmail,
        password,
        accountType
      );

      if (errorMessage) {
        Alert.alert('Unable to sign in', errorMessage);
        return;
      }

      Alert.alert('Welcome back', 'You successfully signed in.');
      router.replace(accountType === 'host' ? '/host-dashboard' : '/dashboard');
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not sign you in. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
 
          <View style={styles.headingArea}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>K9</Text>
            </View>
 
            <Text style={styles.title}>Welcome back</Text>
 
            <Text style={styles.description}>
              {accountType === 'host'
                ? 'Sign in to manage your property and hosting activity.'
                : 'Sign in to manage reservations, favorites, and messages.'}
            </Text>
          </View>
 
          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Email address</Text>
 
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                style={styles.input}
                value={email}
              />
            </View>
 
            <View>
              <Text style={styles.label}>Password</Text>
 
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={setPassword}
                onSubmitEditing={handleSignIn}
                placeholder="Enter your password"
                placeholderTextColor="#8A877D"
                returnKeyType="done"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>
 
            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              onPress={handleSignIn}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isLoading && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFDF8" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </Pressable>
 
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  accountType === 'host' ? '/host-sign-up' : '/sign-up'
                )
              }
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>
                {accountType === 'host'
                  ? 'New host? Create a host account'
                  : 'New to K9 Country? Create a member account'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function MemberSignInScreen() {
  return <SignInScreen accountType="member" />;
}
 
const colors = {
  forest: '#263A24',
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
 
  keyboardView: {
    flex: 1,
  },
 
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
 
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
 
  backButtonText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '700',
  },
 
  headingArea: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 34,
  },
 
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderWidth: 4,
    borderColor: colors.brown,
    marginBottom: 20,
  },
 
  logoText: {
    color: colors.cream,
    fontSize: 32,
    fontWeight: '900',
  },
 
  title: {
    color: colors.forest,
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 10,
  },
 
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 360,
  },
 
  form: {
    gap: 18,
  },
 
  label: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
 
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.warmWhite,
    color: colors.forest,
    fontSize: 16,
    paddingHorizontal: 16,
  },
 
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.forest,
    marginTop: 8,
  },
 
  primaryButtonText: {
    color: colors.warmWhite,
    fontSize: 17,
    fontWeight: '800',
  },
 
  buttonPressed: {
    opacity: 0.78,
  },
 
  buttonDisabled: {
    opacity: 0.65,
  },
 
  textButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
 
  textButtonText: {
    color: colors.brown,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
