import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
 
import { supabase } from '../../lib/supabase';
import type { AccountType } from '../../services/auth-context';
 
type SignUpScreenProps = {
  accountType?: AccountType;
};

export function SignUpScreen({ accountType = 'member' }: SignUpScreenProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
 
  const handleSignUp = async () => {
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
 
    if (
      !normalizedName ||
      !normalizedEmail ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert(
        'Missing information',
        'Complete every field before creating your account.'
      );
      return;
    }
 
    if (password.length < 8) {
      Alert.alert(
        'Password is too short',
        'Create a password containing at least 8 characters.'
      );
      return;
    }
 
    if (password !== confirmPassword) {
      Alert.alert(
        'Passwords do not match',
        'Enter the same password in both password fields.'
      );
      return;
    }
 
    try {
      setIsLoading(true);
 
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedName,
          },
        },
      });
 
      if (error) {
        Alert.alert('Unable to create account', error.message);
        return;
      }

      if (data.session && data.user) {
        const { error: accountRoleError } = await supabase
          .from('account_roles')
          .insert({
            user_id: data.user.id,
            account_type: accountType,
          });

        if (accountRoleError) {
          await supabase.auth.signOut();
          Alert.alert('Unable to create account', accountRoleError.message);
          return;
        }

        await supabase.auth.signOut();
        Alert.alert(
          'Account created',
          accountType === 'host'
            ? 'Your host account is ready. Please sign in to continue.'
            : 'Your member account is ready. Please sign in to continue.',
          [
            {
              text: 'Sign In',
              onPress: () =>
                router.replace(
                  accountType === 'host' ? '/host-sign-in' : '/sign-in'
                ),
            },
          ]
        );
        return;
      }
 
      Alert.alert(
        'Check your email',
        'Your account was created. Open the confirmation email from K9 Country before signing in.',
        [
          {
            text: 'Go to Sign In',
            onPress: () => router.replace('/sign-in'),
          },
        ]
      );
    } catch {
      Alert.alert(
        'Something went wrong',
        'We could not create your account. Please try again.'
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
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
 
            <Text style={styles.title}>Create your account</Text>
 
            <Text style={styles.description}>
              {accountType === 'host'
                ? 'Create a host account to offer a private space.'
                : 'Create a member account to find private spaces for your dog.'}
            </Text>
          </View>
 
          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Full name</Text>
 
              <TextInput
                accessibilityLabel="Full name"
                autoCapitalize="words"
                autoComplete="name"
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                style={styles.input}
                value={fullName}
              />
            </View>
 
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
                autoComplete="new-password"
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#8A877D"
                returnKeyType="next"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>
 
            <View>
              <Text style={styles.label}>Confirm password</Text>
 
              <TextInput
                accessibilityLabel="Confirm password"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setConfirmPassword}
                onSubmitEditing={handleSignUp}
                placeholder="Enter your password again"
                placeholderTextColor="#8A877D"
                returnKeyType="done"
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
              />
            </View>
 
            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              onPress={handleSignUp}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isLoading && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFDF8" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </Pressable>
 
            <Text style={styles.termsText}>
              By creating an account, you agree to K9 Country’s Terms of
              Service, Privacy Policy, and applicable safety rules.
            </Text>
 
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace(
                  accountType === 'host' ? '/host-sign-in' : '/sign-in'
                )
              }
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>
                {accountType === 'host'
                  ? 'Already a host? Sign In'
                  : 'Already a member? Sign In'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function MemberSignUpScreen() {
  return <SignUpScreen accountType="member" />;
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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
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
    marginTop: 12,
    marginBottom: 28,
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
    marginBottom: 18,
  },
 
  logoText: {
    color: colors.cream,
    fontSize: 32,
    fontWeight: '900',
  },
 
  title: {
    color: colors.forest,
    fontSize: 29,
    fontWeight: '900',
    textAlign: 'center',
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
    gap: 17,
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
    backgroundColor: colors.brown,
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
 
  termsText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
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
});
