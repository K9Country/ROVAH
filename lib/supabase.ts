import 'react-native-url-polyfill/auto';
 
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
 
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase environment variables. Check your .env file.'
  );
}
 
// Expo Router renders the web app on the server while it creates static pages.
// Browser and native storage are unavailable there, so auth must use an
// in-memory session until the app reaches a real device or browser.
const isServer = typeof window === 'undefined';
// Browsers retain sessions in their own storage. Native apps instead keep
// Supabase session tokens in the operating system's encrypted credential
// store (iOS Keychain / Android Keystore-backed storage).
const authStorage = isServer
  ? undefined
  : Platform.OS === 'web'
    ? window.localStorage
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: !isServer,
      persistSession: !isServer,
      detectSessionInUrl: !isServer,
    },
  }
);
