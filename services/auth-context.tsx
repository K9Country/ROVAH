import type { Session } from '@supabase/supabase-js';
import {
    createContext,
    PropsWithChildren,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
 
import { supabase } from '../lib/supabase';
 
export type AccountType = 'host' | 'member';

type AuthContextValue = {
  session: Session | null;
  accountType: AccountType | null;
  isLoading: boolean;
  signInAs: (
    email: string,
    password: string,
    expectedAccountType: AccountType
  ) => Promise<{ errorMessage?: string; roleMismatch?: boolean }>;
};
 
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
 
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
 
  useEffect(() => {
    let isMounted = true;

    const clearSession = () => {
      if (!isMounted) {
        return;
      }

      setSession(null);
      setAccountType(null);
      setIsLoading(false);
    };

    const establishSession = async (
      nextSession: Session,
      expectedAccountType?: AccountType
    ) => {
      const { data, error } = await supabase
        .from('account_roles')
        .select('account_type')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();

      const actualAccountType = data?.account_type;
      const isValidAccountType =
        actualAccountType === 'host' || actualAccountType === 'member';

      if (
        error ||
        !isValidAccountType ||
        (expectedAccountType && actualAccountType !== expectedAccountType)
      ) {
        await supabase.auth.signOut();
        clearSession();
        return {
          errorMessage: error
            ? 'We could not verify this account. Please try again.'
            : 'This account cannot use this sign-in page.',
          roleMismatch: Boolean(
            expectedAccountType && actualAccountType !== expectedAccountType
          ),
        };
      }

      if (isMounted) {
        setSession(nextSession);
        setAccountType(actualAccountType);
        setIsLoading(false);
      }

      return {};
    };
 
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }
 
        if (error) {
          console.error('Unable to restore session:', error.message);
          clearSession();
          return;
        }
 
        if (!data.session) {
          clearSession();
          return;
        }

        void establishSession(data.session);
      });
 
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearSession();
      }
    });
 
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInAs: AuthContextValue['signInAs'] = async (
    email,
    password,
    expectedAccountType
  ) => {
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setIsLoading(false);
      return {
        errorMessage: error?.message ?? 'We could not sign you in.',
      };
    }

    const { data: accountRole, error: accountRoleError } = await supabase
      .from('account_roles')
      .select('account_type')
      .eq('user_id', data.session.user.id)
      .maybeSingle();

    const actualAccountType = accountRole?.account_type;
    const isExpectedRole = actualAccountType === expectedAccountType;

    if (accountRoleError || !isExpectedRole) {
      await supabase.auth.signOut();
      setSession(null);
      setAccountType(null);
      setIsLoading(false);

      return {
        errorMessage: accountRoleError
          ? 'We could not verify this account. Please try again.'
          : expectedAccountType === 'host'
            ? 'This is not a host account. Please use the member sign-in.'
            : 'This is a host account. Please use the host sign-in.',
        roleMismatch: !accountRoleError,
      };
    }

    setSession(data.session);
    setAccountType(expectedAccountType);
    setIsLoading(false);
    return {};
  };
 
  const value = useMemo(
    () => ({
      session,
      accountType,
      isLoading,
      signInAs,
    }),
    [session, accountType, isLoading, signInAs]
  );
 
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
 
export function useAuth() {
  const context = useContext(AuthContext);
 
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
 
  return context;
}
