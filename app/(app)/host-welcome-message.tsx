import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HostPageGuide } from '../../components/host-page-guide';
import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type WelcomeMessageRow = { is_enabled: boolean; message_text: string | null };

const starterMessage = 'Thank you for reserving our private space. We are looking forward to welcoming you and your dogs! Please check your reservation details before you arrive.';

export default function HostWelcomeMessageScreen() {
  const { propertyId, propertyName } = useLocalSearchParams<{ propertyId?: string; propertyName?: string }>();
  const { session } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(starterMessage);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const load = useCallback(async () => {
    if (!propertyId || !session?.user.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('property_reservation_welcome_messages')
      .select('is_enabled, message_text')
      .eq('property_id', propertyId)
      .maybeSingle();
    if (error) setStatusMessage('We could not load this welcome message. Please try again.');
    else if (data) {
      const saved = data as WelcomeMessageRow;
      setEnabled(saved.is_enabled);
      setMessage(saved.message_text?.trim() || starterMessage);
    }
    setIsLoading(false);
  }, [propertyId, session?.user.id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!propertyId || !session?.user.id || isSaving) return;
    const cleanMessage = message.trim();
    if (enabled && !cleanMessage) {
      setStatusMessage('Write a welcome message before turning it on.');
      return;
    }
    if (cleanMessage.length > 2000) {
      setStatusMessage('Keep the welcome message to 2,000 characters or fewer.');
      return;
    }
    setIsSaving(true);
    setStatusMessage('');
    const { error } = await supabase
      .from('property_reservation_welcome_messages')
      .upsert({
        property_id: propertyId,
        is_enabled: enabled,
        message_text: cleanMessage || null,
        updated_by: session.user.id,
      }, { onConflict: 'property_id' });
    if (error) setStatusMessage(error.message || 'We could not save your welcome message.');
    else setStatusMessage(enabled ? 'Welcome message saved and turned on.' : 'Welcome message saved and turned off.');
    setIsSaving(false);
  };

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
        <Text style={styles.backButtonText}>Host Dashboard</Text>
      </Pressable>
      <Text style={styles.eyebrow}>MANAGE YOUR SITE</Text>
      <Text style={styles.title}>Guest Welcome Message</Text>
      <Text style={styles.description}>Save one message for {propertyName ?? 'this site'}. When a new reservation is confirmed, ROVAH sends it once to the guest in your normal message thread.</Text>

      <View style={styles.siteCard}><Text style={styles.siteLabel}>SITE</Text><Text style={styles.siteName}>{propertyName ?? 'Selected site'}</Text></View>

      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} size="large" /></View> : <>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={() => { setEnabled((value) => !value); setStatusMessage(''); }} style={[styles.switchCard, enabled && styles.switchCardEnabled]}>
          <View style={styles.switchCopy}><Text style={styles.switchTitle}>{enabled ? 'Welcome message is on' : 'Welcome message is off'}</Text><Text style={styles.switchDescription}>{enabled ? 'Each newly confirmed reservation receives this message one time.' : 'No automatic message will be sent until you turn this on.'}</Text></View>
          <View style={[styles.toggle, enabled && styles.toggleOn]}><View style={[styles.toggleKnob, enabled && styles.toggleKnobOn]} /></View>
        </Pressable>

        <Text style={styles.sectionTitle}>Message guests will receive</Text>
        <TextInput accessibilityLabel="Automatic guest welcome message" editable={!isSaving} maxLength={2000} multiline onChangeText={setMessage} placeholder="Write your welcome message." placeholderTextColor="#8A877D" style={styles.messageInput} textAlignVertical="top" value={message} />
        <Text style={styles.characterCount}>{message.length}/2,000</Text>

        <View style={styles.previewCard}><Text style={styles.previewLabel}>GUEST PREVIEW</Text><Text style={styles.previewTitle}>Message from your host</Text><Text style={styles.previewText}>{message.trim() || 'Your saved message will appear here.'}</Text></View>
        {statusMessage ? <View style={[styles.statusBanner, statusMessage.includes('saved') && styles.successBanner]}><Text style={[styles.statusText, statusMessage.includes('saved') && styles.successText]}>{statusMessage}</Text></View> : null}
        <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void save()} style={[styles.saveButton, isSaving && styles.buttonDisabled]}>{isSaving ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.saveButtonText}>Save Welcome Message</Text>}</Pressable>
      </>}

      <HostPageGuide
        title="How automatic welcome messages work"
        intro="This is a simple arrival note for every new confirmed reservation at this site."
        steps={[
          { title: 'Write it once', text: 'Use this space for useful information such as a friendly welcome, parking reminder, gate instruction, or what guests should bring.' },
          { title: 'Turn it on', text: 'Save the message with the switch on. You can return at any time to edit it or turn it off.' },
          { title: 'ROVAH sends it once', text: 'After a reservation is confirmed, the guest receives this message in the regular ROVAH conversation and by email. It is never resent when you edit the message or update the reservation.' },
          { title: 'Keep using Messages', text: 'Reply to questions and send personal updates from Messages as usual. This automatic note does not replace your normal conversations.' },
        ]}
      />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 42 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '900' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 7 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  siteCard: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 16 },
  siteLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  siteName: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 5 },
  loading: { minHeight: 180, justifyContent: 'center' },
  switchCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 17, borderWidth: 1, flexDirection: 'row', marginTop: 22, padding: 16 },
  switchCardEnabled: { backgroundColor: colors.lightGreen, borderColor: '#9FBD94' },
  switchCopy: { flex: 1, paddingRight: 12 },
  switchTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  switchDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  toggle: { backgroundColor: '#BEBBB1', borderRadius: 17, height: 34, justifyContent: 'center', padding: 3, width: 60 },
  toggleOn: { backgroundColor: colors.forest },
  toggleKnob: { backgroundColor: colors.warmWhite, borderRadius: 14, height: 28, width: 28 },
  toggleKnobOn: { alignSelf: 'flex-end' },
  sectionTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginBottom: 10, marginTop: 26 },
  messageInput: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.forest, fontSize: 16, minHeight: 156, padding: 14 },
  characterCount: { color: colors.muted, fontSize: 12, marginTop: 6, textAlign: 'right' },
  previewCard: { backgroundColor: '#F3F0E7', borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 },
  previewLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  previewTitle: { color: colors.forest, fontSize: 16, fontWeight: '900', marginTop: 7 },
  previewText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  statusBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 13, borderWidth: 1, marginTop: 14, padding: 13 },
  successBanner: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6' },
  statusText: { color: colors.red, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  successText: { color: colors.forest },
  saveButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 56, paddingHorizontal: 18 },
  saveButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
  buttonDisabled: { opacity: 0.6 },
});
