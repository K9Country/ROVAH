import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { getAuthEmailRedirectUrl, type AuthIntent } from './auth-redirect';
import { supabase } from './supabase';

/** Starts the Google OAuth flow without exposing any Google credentials in the app. */
export async function continueWithGoogle(intent: AuthIntent) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthEmailRedirectUrl(intent),
      // Web uses the browser redirect managed by Supabase. Native opens the
      // returned URL using the device's secure browser handoff.
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });

  if (!error && Platform.OS !== 'web' && data.url) {
    await Linking.openURL(data.url);
  }

  return { error };
}
