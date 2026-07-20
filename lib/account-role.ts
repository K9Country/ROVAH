import { supabase } from './supabase';

export type AccountType = 'host' | 'member';

export async function getAccountType(userId: string): Promise<AccountType | null> {
  const { data, error } = await supabase
    .from('account_roles')
    .select('account_type')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.account_type === 'host' || data?.account_type === 'member'
    ? data.account_type
    : null;
}

export async function ensureAccountType(
  userId: string,
  requestedType: AccountType
): Promise<AccountType> {
  const currentType = await getAccountType(userId);

  if (currentType) {
    if (currentType !== requestedType) {
      throw new Error(
        `This email is registered as a ${currentType === 'host' ? 'host' : 'member'} account. Please sign in from the ${currentType === 'host' ? 'Host' : 'Member'} Sign In page.`
      );
    }

    return currentType;
  }

  const { error } = await supabase
    .from('account_roles')
    .insert({ user_id: userId, account_type: requestedType });

  if (error) {
    throw error;
  }

  // The insert policy already enforces that this user owns the one immutable
  // role record. Returning the selected type avoids a second RLS round trip
  // during email confirmation, where a just-created row may not yet be
  // available to a chained read response.
  return requestedType;
}
