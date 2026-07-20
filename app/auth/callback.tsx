import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, typography } from '../../constants/theme';
import { ensureAccountType } from '../../lib/account-role';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

export default function EmailConfirmationCallbackScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { isLoading, session, setAccountTypeAfterSetup } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExchanging, setIsExchanging] = useState(true);
  const isCompleting = useRef(false);
  const isHostConfirmation = intent === 'host' || session?.user.user_metadata?.account_intent === 'host';

  useEffect(() => {
    let isMounted = true;

    const exchangeConfirmationLink = async () => {
      try {
        const {
          data: { session: existingSession },
        } = await supabase.auth.getSession();
        if (existingSession) return;

        const url = Platform.OS === 'web'
          ? window.location.href
          : await Linking.getInitialURL();
        if (!url) throw new Error('The confirmation link was incomplete. Please request a new confirmation email.');

        const parsedUrl = Linking.parse(url);
        const code = parsedUrl.queryParams?.code;
        if (typeof code === 'string') {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          return;
        }

        const params = new URLSearchParams(url.split('#')[1] ?? '');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (!accessToken || !refreshToken) {
          throw new Error('This confirmation link has expired. Please request a new confirmation email.');
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'We could not confirm this email. Please request a new confirmation email.'
          );
        }
      } finally {
        if (isMounted) setIsExchanging(false);
      }
    };

    void exchangeConfirmationLink();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (session?.user.id && !isCompleting.current) {
      const finishSignIn = async () => {
        isCompleting.current = true;
        // Email providers and browser handoffs can drop the redirect query
        // string. The signup metadata restores the original requested flow;
        // ensureAccountType remains the authoritative role check.
        const requestedAccountType = intent === 'host' || session.user.user_metadata?.account_intent === 'host'
          ? 'host'
          : 'member';

        try {
          const accountType = await ensureAccountType(
            session.user.id,
            requestedAccountType
          );
          setAccountTypeAfterSetup(accountType);

          if (accountType === 'host') {
            router.dismissAll();
            router.replace('/host');
            return;
          }

          router.dismissAll();
          router.replace('/profile?onboarding=true');
        } catch (error) {
          isCompleting.current = false;
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'We could not finish setting up this account. Please return to the welcome page and try again.'
          );
        }
      };

      void finishSignIn();
    }
  }, [intent, session?.user.id, session?.user.user_metadata?.account_intent, setAccountTypeAfterSetup]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {isExchanging || (session && !errorMessage) ? <ActivityIndicator size="large" color={colors.forest} /> : null}
        <Text style={styles.title}>{errorMessage ? `We could not open your ${isHostConfirmation ? 'Hosting Profile' : 'Parent Profile'}` : `Opening ${isHostConfirmation ? 'Hosting Profile' : 'Parent Profile'}`}</Text>
        <Text style={styles.description}>
          {errorMessage
            ? 'Please request a fresh confirmation email or return to sign in.'
            : `Your email is confirmed. K9 Country is opening your ${isHostConfirmation ? 'Hosting Profile' : 'Parent Profile'}.`}
        </Text>
        {errorMessage ? (
          <>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable onPress={() => router.replace('/')} style={styles.button}>
              <Text style={styles.buttonText}>Return to Welcome Page</Text>
            </Pressable>
          </>
        ) : !isExchanging && !isLoading && !session ? (
          <Pressable onPress={() => router.replace('/sign-in')} style={styles.button}>
            <Text style={styles.buttonText}>Return to Sign In</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 26, fontWeight: '900', marginTop: 18 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  errorText: { color: colors.red, fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 16, textAlign: 'center' },
  button: { backgroundColor: colors.brown, borderRadius: 14, marginTop: 24, minHeight: 52, justifyContent: 'center', paddingHorizontal: 22 },
  buttonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '800' },
});
