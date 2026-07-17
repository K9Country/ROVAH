import { supabase } from './supabase';

/** Returns whether a dog owner has completed the required member profile. */
export async function hasCompletedMemberProfile(userId: string) {
  const { data, error } = await supabase
    .from('guest_profiles')
    .select('profile_completed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Do not trap a signed-in member on a loading screen if the profile check
    // is temporarily unavailable. Booking still independently requires it.
    console.error('Unable to check member profile completion:', error.message);
    return true;
  }

  return Boolean(data?.profile_completed_at);
}
