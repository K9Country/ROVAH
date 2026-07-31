import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getAccountType, type AccountType } from '../lib/account-role';
import { clearExplicitMemberSignOut } from '../lib/member-entry';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  isAnonymous: boolean;
  isMember: boolean;
  isHost: boolean;
  setAccountTypeAfterSetup: (accountType: AccountType) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const accountLookupVersion = useRef(0);
  const pendingAuthStateResolutionVersion = useRef(0);

  const setAccountTypeAfterSetup = useCallback((nextAccountType: AccountType) => {
    // A newly completed email confirmation is authoritative. Ignore any
    // earlier background lookup that started before the role was created.
    // This is also used after a password sign-in has already verified the
    // account role, so the queued SIGNED_IN lookup cannot briefly put the
    // protected dashboard back into a loading state.
    accountLookupVersion.current += 1;
    pendingAuthStateResolutionVersion.current += 1;
    setAccountType(nextAccountType);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshAccountStatus = async (currentSession: Session | null) => {
      const lookupVersion = accountLookupVersion.current + 1;
      accountLookupVersion.current = lookupVersion;
      const isAnonymous = Boolean(
        (currentSession?.user as { is_anonymous?: boolean } | undefined)
          ?.is_anonymous
      );

      if (!currentSession?.user?.id || isAnonymous) {
        if (isMounted && accountLookupVersion.current === lookupVersion) {
          setAccountType(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        if (isMounted) setIsLoading(true);
        const nextAccountType = await Promise.race<AccountType | null>([
          getAccountType(currentSession.user.id),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 8_000);
          }),
        ]);
        if (isMounted && accountLookupVersion.current === lookupVersion) {
          setAccountType(nextAccountType);
          if (nextAccountType === 'member') {
            void clearExplicitMemberSignOut();
          }
        }
      } catch (error) {
        console.error('Unable to read account type:', error);
        if (isMounted && accountLookupVersion.current === lookupVersion) {
          setAccountType(null);
        }
      } finally {
        if (isMounted && accountLookupVersion.current === lookupVersion) {
          setIsLoading(false);
        }
      }
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.error('Unable to restore session:', error.message);
      setSession(data.session);
      void refreshAccountStatus(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // Supabase holds an internal auth lock while this callback runs. Start
      // the role lookup immediately after it returns so sign-in cannot stall.
      const resolutionVersion = pendingAuthStateResolutionVersion.current + 1;
      pendingAuthStateResolutionVersion.current = resolutionVersion;
      setIsLoading(true);
      setTimeout(() => {
        if (
          !isMounted ||
          pendingAuthStateResolutionVersion.current !== resolutionVersion
        ) {
          return;
        }
        void refreshAccountStatus(nextSession);
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const isAnonymous = Boolean(
      (session?.user as { is_anonymous?: boolean } | undefined)?.is_anonymous
    );

    return {
      session,
      isLoading,
      isAnonymous,
      isMember: accountType === 'member',
      isHost: accountType === 'host',
      setAccountTypeAfterSetup,
    };
  }, [accountType, isLoading, session, setAccountTypeAfterSetup]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
