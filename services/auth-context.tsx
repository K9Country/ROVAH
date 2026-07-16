import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
    createContext,
    PropsWithChildren,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
 
import { supabase } from '../lib/supabase';
 
type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  isAnonymous: boolean;
  isMember: boolean;
  isHost: boolean;
};

const hostModeStorageKey = '@k9-country/host-mode';
 
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
 
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    const loadStoredHostMode = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(hostModeStorageKey);
        if (storedValue === 'host') {
          setIsHost(true);
        } else if (storedValue === 'guest') {
          setIsHost(false);
        } else {
          setIsHost(false);
        }
      } catch (error) {
        console.error('Unable to restore host mode:', error);
      }
    };

    void loadStoredHostMode();
  }, []);
 
  useEffect(() => {
    let isMounted = true;

    const refreshHostStatus = async (currentSession: Session | null) => {
      if (!currentSession?.user?.id) {
        if (isMounted) {
          setIsHost(false);
        }
        return;
      }

      try {
        const storedValue = await AsyncStorage.getItem(hostModeStorageKey);
        if (storedValue === 'host') {
          if (isMounted) {
            setIsHost(true);
          }
          return;
        }

        if (storedValue === 'guest') {
          if (isMounted) {
            setIsHost(false);
          }
          return;
        }
      } catch (error) {
        console.error('Unable to read host mode preference:', error);
      }

      try {
        const { data, error } = await supabase
          .from('host_profiles')
          .select('user_id')
          .eq('user_id', currentSession.user.id)
          .maybeSingle();

        if (!isMounted) {
          return;
        }

        if (error) {
          console.error('Unable to resolve host status:', error.message);
          setIsHost(false);
          return;
        }

        setIsHost(Boolean(data));
      } catch (error) {
        console.error('Unable to resolve host status:', error);
        if (isMounted) {
          setIsHost(false);
        }
      }
    };

    const restoreSessionFromAuthUrl = async (url: string | null) => {
      if (!url) {
        return;
      }

      const parsedUrl = Linking.parse(url);
      const code = parsedUrl.queryParams?.code;

      try {
        if (typeof code === 'string') {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error('Unable to confirm email:', error.message);
          }

          return;
        }

        const fragment = url.split('#')[1];
        const params = new URLSearchParams(fragment ?? '');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('Unable to restore confirmed session:', error.message);
          }
        }
      } catch (error) {
        console.error('Unable to handle the email confirmation link:', error);
      }
    };
 
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }
 
        if (error) {
          console.error('Unable to restore session:', error.message);
        }
 
        setSession(data.session);
        void refreshHostStatus(data.session);
        setIsLoading(false);
      });
 
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void refreshHostStatus(nextSession);
      setIsLoading(false);
    });

    void Linking.getInitialURL().then(restoreSessionFromAuthUrl);

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void restoreSessionFromAuthUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);
 
  const value = useMemo(
    () => {
      const isAnonymous = Boolean(
        (session?.user as { is_anonymous?: boolean } | undefined)
          ?.is_anonymous
      );

      return {
        session,
        isLoading,
        isAnonymous,
        isMember: Boolean(session) && !isAnonymous,
        isHost,
      };
    },
    [session, isLoading, isHost]
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
