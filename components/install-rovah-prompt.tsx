import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISSED_KEY = 'rovah-install-invitation-dismissed';

function isAlreadyInstalled() {
  if (typeof window === 'undefined') return false;

  const browserNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    browserNavigator.standalone === true
  );
}

/**
 * Android Chrome only permits the native install confirmation after a person
 * taps a control. This card appears automatically whenever Chrome says ROVAH
 * is eligible, then opens that confirmation with one tap.
 */
export function InstallRovahPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIphoneGuide, setShowIphoneGuide] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || isAlreadyInstalled()) return;

    if (window.sessionStorage.getItem(DISMISSED_KEY) === 'true') {
      setIsDismissed(true);
      return;
    }

    const isIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    if (isIphone && isSafari) {
      setShowIphoneGuide(true);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    window.sessionStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
    setShowIphoneGuide(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'dismissed') dismiss();
  };

  if ((!deferredPrompt && !showIphoneGuide) || isDismissed) return null;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.copy}>
        <Text style={styles.title}>Install ROVAH</Text>
        <Text style={styles.description}>
          {showIphoneGuide
            ? 'Tap Share, then Add to Home Screen, to put ROVAH on your iPhone home screen.'
            : 'Put ROVAH on your phone home screen for one-tap access.'}
        </Text>
      </View>
      <View style={styles.actions}>
        {!showIphoneGuide && (
          <Pressable accessibilityRole="button" onPress={install} style={styles.installButton}>
            <Text style={styles.installLabel}>Install app</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={dismiss} hitSlop={8} style={styles.notNowButton}>
          <Text style={styles.notNowLabel}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FEFDF9',
    borderColor: '#D9CDB7',
    borderRadius: 20,
    borderWidth: 1,
    bottom: 18,
    elevation: 8,
    left: 16,
    padding: 16,
    position: 'absolute',
    right: 16,
    shadowColor: '#102517',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    zIndex: 999,
  },
  copy: {
    gap: 4,
  },
  title: {
    color: '#173D24',
    fontSize: 18,
    fontWeight: '900',
  },
  description: {
    color: '#5E5B53',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  installButton: {
    alignItems: 'center',
    backgroundColor: '#173D24',
    borderRadius: 12,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  installLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  notNowButton: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  notNowLabel: {
    color: '#5E5B53',
    fontSize: 14,
    fontWeight: '800',
  },
});
