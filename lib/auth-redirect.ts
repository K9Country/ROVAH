import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Email links must always use the public website. Linking.createURL() resolves
// to localhost while the app is running in development, which makes emailed
// links unusable on another person's phone.
const PUBLIC_WEB_APP_URL = 'https://rovah.dog';

export type AuthIntent = 'guest' | 'host' | 'admin';

function normalizeIntent(intent?: string): AuthIntent {
  return intent === 'host' || intent === 'admin' ? intent : 'guest';
}

/**
 * Builds the approved return address Supabase uses after an email action.
 * Native builds use the app's stable custom URL scheme; web always uses
 * the public hosted address.
 */
export function getAuthEmailRedirectUrl(intent?: string) {
  const normalizedIntent = normalizeIntent(intent);

  if (Platform.OS !== 'web') {
    return Linking.createURL('auth/callback', {
      queryParams: { intent: normalizedIntent },
      scheme: 'k9country',
    });
  }

  const url = new URL('/auth/callback', PUBLIC_WEB_APP_URL);
  url.searchParams.set('intent', normalizedIntent);
  return url.toString();
}

/**
 * Builds the public return address for a password recovery email. Password
 * recovery keeps the account intent in the URL so an administrator who sets a
 * password for the first time returns to the administrator sign-in screen.
 */
export function getPasswordResetRedirectUrl(intent?: string) {
  const normalizedIntent = normalizeIntent(intent);

  if (Platform.OS !== 'web') {
    return Linking.createURL('reset-password', {
      queryParams: { intent: normalizedIntent },
      scheme: 'k9country',
    });
  }

  const url = new URL('/reset-password', PUBLIC_WEB_APP_URL);
  url.searchParams.set('intent', normalizedIntent);
  return url.toString();
}
