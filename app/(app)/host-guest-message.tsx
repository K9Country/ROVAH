import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { HostPageGuide } from '../../components/host-page-guide';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';

type Audience = 'all' | 'upcoming' | 'past';
type BookingAudienceRow = { guest_id: string; end_at: string; status: 'confirmed' | 'cancelled' };

const audienceCopy: Record<Audience, { label: string; description: string }> = {
  all: { label: 'All visitors', description: 'Every guest with a confirmed reservation for this site.' },
  upcoming: { label: 'Upcoming / current', description: 'Guests with a visit that has not ended yet.' },
  past: { label: 'Previous visitors', description: 'Guests whose confirmed visit has ended.' },
};

export default function HostGuestMessageScreen() {
  const { propertyId, propertyName } = useLocalSearchParams<{ propertyId?: string; propertyName?: string }>();
  const { session } = useAuth();
  const [bookings, setBookings] = useState<BookingAudienceRow[]>([]);
  const [audience, setAudience] = useState<Audience>('all');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadAudience = useCallback(async () => {
    if (!session?.user.id || !propertyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('guest_id, end_at, status')
      .eq('property_id', propertyId)
      .eq('status', 'confirmed');
    if (error) setStatusMessage('We could not load this site’s visitors. Please try again.');
    else setBookings((data ?? []) as BookingAudienceRow[]);
    setIsLoading(false);
  }, [propertyId, session?.user.id]);

  useEffect(() => { void loadAudience(); }, [loadAudience]);

  const recipientCount = useMemo(() => {
    const now = Date.now();
    const eligible = bookings.filter((booking) => {
      const visitEnded = new Date(booking.end_at).getTime() <= now;
      return audience === 'all' || (audience === 'upcoming' && !visitEnded) || (audience === 'past' && visitEnded);
    });
    return new Set(eligible.map((booking) => booking.guest_id)).size;
  }, [audience, bookings]);

  const requestSend = () => {
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      setStatusMessage('Write a message before sending.');
      return;
    }
    if (cleanMessage.length > 2000) {
      setStatusMessage('Keep the message to 2,000 characters or fewer.');
      return;
    }
    if (recipientCount === 0) {
      setStatusMessage('There are no confirmed visitors in this group yet.');
      return;
    }
    setStatusMessage('');
    setIsConfirmOpen(true);
  };

  const sendMessage = async () => {
    if (!propertyId || isSending) return;
    try {
      setIsSending(true);
      setStatusMessage('');
      const { data, error } = await supabase.rpc('send_property_guest_broadcast', {
        p_property_id: propertyId,
        p_audience: audience,
        p_message: message.trim(),
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      const sentCount = Number(result?.recipient_count ?? recipientCount);
      setMessage('');
      setIsConfirmOpen(false);
      setStatusMessage(`Message sent to ${sentCount} ${sentCount === 1 ? 'visitor' : 'visitors'}.`);
    } catch (error) {
      setIsConfirmOpen(false);
      setStatusMessage(error instanceof Error ? error.message : 'We could not send this message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
        <Text style={styles.backButtonText}>Host Dashboard</Text>
      </Pressable>
      <Text style={styles.eyebrow}>GUEST MESSAGING</Text>
      <Text style={styles.title}>Message site visitors</Text>
      <Text style={styles.description}>Send a private in-app message to confirmed visitors of {propertyName ?? 'this site'}. Each visitor receives the message in their own conversation with you.</Text>

      <View style={styles.siteCard}><Text style={styles.siteLabel}>SITE</Text><Text style={styles.siteName}>{propertyName ?? 'Selected site'}</Text></View>
      <Text style={styles.sectionTitle}>Choose recipients</Text>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.forest} /></View> : (Object.keys(audienceCopy) as Audience[]).map((option) => {
        const selected = audience === option;
        return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={option} onPress={() => setAudience(option)} style={[styles.audienceOption, selected && styles.audienceOptionSelected]}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View><View style={styles.audienceCopy}><Text style={styles.audienceTitle}>{audienceCopy[option].label}</Text><Text style={styles.audienceText}>{audienceCopy[option].description}</Text></View></Pressable>;
      })}
      {!isLoading ? <Text style={styles.recipientCount}>{recipientCount} {recipientCount === 1 ? 'visitor' : 'visitors'} will receive this message.</Text> : null}

      <Text style={styles.sectionTitle}>Your message</Text>
      <TextInput accessibilityLabel="Message to site visitors" maxLength={2000} multiline onChangeText={setMessage} placeholder="Write a helpful update for your visitors." placeholderTextColor="#8A877D" style={styles.messageInput} textAlignVertical="top" value={message} />
      <Text style={styles.characterCount}>{message.length}/2,000</Text>
      {statusMessage ? <View style={[styles.statusBanner, statusMessage.startsWith('Message sent') && styles.successBanner]}><Text style={[styles.statusText, statusMessage.startsWith('Message sent') && styles.successText]}>{statusMessage}</Text></View> : null}
      <Pressable accessibilityRole="button" disabled={isLoading || isSending} onPress={requestSend} style={[styles.sendButton, (isLoading || isSending) && styles.buttonDisabled]}>{isSending ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.sendButtonText}>Send to {recipientCount} {recipientCount === 1 ? 'visitor' : 'visitors'}</Text>}</Pressable>
      <HostPageGuide
        title="How to use Broadcast Message"
        intro="Use this page to send one update to guests connected to this selected site."
        steps={[
          { title: 'Choose who receives it', text: 'Send to all visitors, upcoming visitors, or previous visitors of this site.' },
          { title: 'Check the audience count', text: 'Review the number of unique guests before sending. Individual names are not shown here.' },
          { title: 'Write the update', text: 'Keep it useful and specific, such as a seasonal schedule, parking reminder, or site improvement.' },
          { title: 'Review, then send', text: 'Confirm the message when it is ready. Guests receive it in their ROVAH messages.' },
        ]}
      />
    </ScrollView>
    <Modal animationType="fade" onRequestClose={() => setIsConfirmOpen(false)} transparent visible={isConfirmOpen}>
      <View style={styles.modalBackdrop}><View accessibilityRole="alert" style={styles.modal}><Text style={styles.modalTitle}>Send this message?</Text><Text style={styles.modalText}>This will send your message to {recipientCount} {recipientCount === 1 ? 'visitor' : 'visitors'} from {propertyName ?? 'this site'}.</Text><Pressable accessibilityRole="button" disabled={isSending} onPress={() => void sendMessage()} style={[styles.confirmButton, isSending && styles.buttonDisabled]}>{isSending ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.confirmButtonText}>Send Message</Text>}</Pressable><Pressable accessibilityRole="button" disabled={isSending} onPress={() => setIsConfirmOpen(false)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable></View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 42 }, backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 }, backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '900' }, eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 }, title: { color: colors.forest, fontSize: 30, fontWeight: '900', marginTop: 7 }, description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 }, siteCard: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6', borderRadius: 18, borderWidth: 1, marginTop: 20, padding: 16 }, siteLabel: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, siteName: { color: colors.forest, fontSize: 18, fontWeight: '900', marginTop: 5 }, sectionTitle: { color: colors.forest, fontSize: 19, fontWeight: '900', marginTop: 26, marginBottom: 10 }, loading: { minHeight: 110, justifyContent: 'center' }, audienceOption: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 10, minHeight: 76, padding: 14 }, audienceOptionSelected: { backgroundColor: '#E7F0E3', borderColor: colors.forest, borderWidth: 2 }, radio: { alignItems: 'center', borderColor: colors.brown, borderRadius: 11, borderWidth: 1, height: 22, justifyContent: 'center', marginRight: 12, width: 22 }, radioSelected: { borderColor: colors.forest, borderWidth: 2 }, radioDot: { backgroundColor: colors.forest, borderRadius: 6, height: 10, width: 10 }, audienceCopy: { flex: 1 }, audienceTitle: { color: colors.forest, fontSize: 16, fontWeight: '900' }, audienceText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }, recipientCount: { color: colors.brown, fontSize: 14, fontWeight: '900', marginTop: 13, textAlign: 'center' }, messageInput: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.forest, fontSize: 16, minHeight: 150, padding: 14 }, characterCount: { color: colors.muted, fontSize: 12, marginTop: 6, textAlign: 'right' }, statusBanner: { backgroundColor: '#FCEDEB', borderColor: '#E9B7B0', borderRadius: 13, borderWidth: 1, marginTop: 14, padding: 13 }, successBanner: { backgroundColor: colors.lightGreen, borderColor: '#C4D2B6' }, statusText: { color: colors.red, fontSize: 14, fontWeight: '800', lineHeight: 20 }, successText: { color: colors.forest }, sendButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 56, paddingHorizontal: 18 }, sendButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' }, buttonDisabled: { opacity: 0.6 }, modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(20, 38, 24, 0.58)', flex: 1, justifyContent: 'center', padding: 24 }, modal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 430, padding: 24, width: '100%' }, modalTitle: { color: colors.forest, fontSize: 23, fontWeight: '900', textAlign: 'center' }, modalText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12, textAlign: 'center' }, confirmButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 13, justifyContent: 'center', marginTop: 22, minHeight: 52 }, confirmButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' }, cancelButton: { alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 }, cancelButtonText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
});
