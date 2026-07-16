import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Returns the current authenticated session, creating a temporary anonymous
 * session only when a visitor starts a message. This keeps public browsing
 * account-free while giving each conversation a secure participant identity.
 */
export async function ensureMessagingSession(
  currentSession: Session | null
): Promise<Session> {
  if (currentSession) {
    return currentSession;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.session) {
    throw error ?? new Error('Unable to start a secure guest session.');
  }

  return data.session;
}
