import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/theme';

export function SmsConsent({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.row}>
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <Text style={styles.check}>✓</Text> : null}</View>
      <View style={styles.copy}><Text style={styles.title}>Text message updates (optional)</Text><Text style={styles.text}>I agree to receive ROVAH text messages about reservations, account updates, and messages. Consent is not required to use ROVAH. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.</Text></View>
    </Pressable>
    <Text style={styles.legal}>By selecting this option, you also acknowledge the <Text accessibilityRole="link" onPress={() => router.push('/privacy' as never)} style={styles.link}>Privacy Policy</Text> and <Text accessibilityRole="link" onPress={() => router.push('/legal/terms-of-service' as never)} style={styles.link}>Terms of Service</Text>.</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 13, borderWidth: 1, marginTop: 10, padding: 12 },
  row: { alignItems: 'flex-start', flexDirection: 'row' },
  box: { alignItems: 'center', borderColor: colors.forest, borderRadius: 6, borderWidth: 1, height: 22, justifyContent: 'center', marginRight: 10, marginTop: 2, width: 22 },
  boxChecked: { backgroundColor: colors.forest },
  check: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' },
  copy: { flex: 1 }, title: { color: colors.forest, fontSize: 14, fontWeight: '900' }, text: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  legal: { color: colors.muted, fontSize: 11, lineHeight: 16, marginLeft: 32, marginTop: 7 }, link: { color: colors.brown, fontWeight: '900', textDecorationLine: 'underline' },
});
