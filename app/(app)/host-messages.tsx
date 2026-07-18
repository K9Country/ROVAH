import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationAvatar } from '../../components/conversation-avatar';
import { colors, shadows, typography } from '../../constants/theme';
import { formatMessageTimestamp, getLastMessageTimes, getUnreadConversationIds } from '../../lib/messaging';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { PropertyConversation } from '../../types/messaging';

type ConversationListItem = PropertyConversation & {
  personName: string;
  profileImageUrl?: string;
  lastMessageAt?: string;
};

type ConversationProfileImage = {
  bucket_id: string;
  profile_image_path: string;
  user_id: string;
};

export default function HostMessagesScreen() {
  const { session } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<ConversationListItem | null>(null);

  const loadConversations = useCallback(async () => {
    if (!session?.user.id) {
      setConversations([]);
      setUnreadConversationIds(new Set());
      return;
    }

    const displayName =
      typeof session.user.user_metadata?.full_name === 'string'
        ? session.user.user_metadata.full_name
        : session.user.email?.split('@')[0] ?? 'K9 Country Host';

    await supabase
      .from('messaging_profiles')
      .upsert(
        { user_id: session.user.id, display_name: displayName.trim() },
        { onConflict: 'user_id' }
      );

    const { data } = await supabase
      .from('property_conversations')
      .select('*')
      .eq('host_id', session.user.id)
      .order('created_at', { ascending: false });

    const rows = (data ?? []) as PropertyConversation[];
    const guestIds = [...new Set(rows.map((row) => row.guest_id))];

    const [{ data: profiles }, { data: avatarPaths }, unreadIds, lastMessageTimes] = await Promise.all([
      guestIds.length
        ? supabase
            .from('messaging_profiles')
            .select('user_id, display_name')
            .in('user_id', guestIds)
        : Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }),
      guestIds.length
        ? supabase.rpc('get_conversation_profile_images', { target_user_ids: guestIds })
        : Promise.resolve({ data: [] as { bucket_id: string; profile_image_path: string; user_id: string }[] }),
      getUnreadConversationIds(rows, session.user.id),
      getLastMessageTimes(rows, session.user.id),
    ]);

    const people = new Map(
      (profiles ?? []).map((profile) => [profile.user_id, profile.display_name])
    );
    const avatarUrls = new Map(
      ((avatarPaths ?? []) as ConversationProfileImage[]).map((avatar) => [
        avatar.user_id,
        supabase.storage.from(avatar.bucket_id).getPublicUrl(avatar.profile_image_path).data.publicUrl,
      ])
    );
    setConversations(
      rows.map((row) => ({
        ...row,
        personName: people.get(row.guest_id) ?? 'Guest',
        profileImageUrl: avatarUrls.get(row.guest_id),
        lastMessageAt: lastMessageTimes.get(row.id),
      }))
    );
    setUnreadConversationIds(unreadIds);
  }, [session?.user.email, session?.user.id, session?.user.user_metadata?.full_name]);

  useEffect(() => {
    void loadConversations().finally(() => setIsLoading(false));
    const refreshInterval = setInterval(() => void loadConversations(), 15_000);
    return () => clearInterval(refreshInterval);
  }, [loadConversations]);

  const refresh = async () => {
    setIsRefreshing(true);
    await loadConversations();
    setIsRefreshing(false);
  };

  const deleteConversation = (conversation: ConversationListItem) => {
    if (deletingConversationId) return;
    setConversationPendingDeletion(conversation);
  };

  const confirmDeleteConversation = async (conversationId: string) => {
    try {
      setDeletingConversationId(conversationId);
      const { data, error } = await supabase.from('property_conversations').delete().eq('id', conversationId).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('This conversation can no longer be deleted.');
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      setUnreadConversationIds((current) => {
        const next = new Set(current);
        next.delete(conversationId);
        return next;
      });
    } catch (error) {
      Alert.alert('Unable to delete conversation', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setDeletingConversationId(null);
      setConversationPendingDeletion(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.forest} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={isRefreshing}
            tintColor={colors.forest}
          />
        }
      >
        <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Host Dashboard</Text>
        </Pressable>

        <Text style={styles.title}>Guest Messages</Text>
        <Text style={styles.description}>
          Each guest has one shared conversation across all of your private spaces.
        </Text>

        {conversations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>
              Guest questions from your live listings will appear here.
            </Text>
          </View>
        ) : (
          conversations.map((conversation) => {
            const hasUnread = unreadConversationIds.has(conversation.id);
            const isDeleting = deletingConversationId === conversation.id;

            return <View key={conversation.id} style={[styles.conversationCard, hasUnread && styles.conversationCardUnread]}>
              <Pressable
                accessibilityLabel={`View ${conversation.personName}'s guest profile`}
                accessibilityRole="button"
                onPress={() => router.push(`/host-guests/${conversation.guest_id}?guestName=${encodeURIComponent(conversation.personName)}` as never)}
                style={styles.profileButton}
              >
                <ConversationAvatar hasUnread={hasUnread} imageUrl={conversation.profileImageUrl} name={conversation.personName} />
              </Pressable>
              <Pressable onPress={() => router.push(`/messages/${conversation.property_id}?conversationId=${conversation.id}` as never)} style={styles.conversationOpenButton}>
                <View style={styles.conversationContent}>
                  <Text style={styles.conversationTitle}>{conversation.personName}</Text>
                  {hasUnread ? <Text style={styles.newMessageLabel}>NEW MESSAGE</Text> : null}
                  {conversation.lastMessageAt ? <Text style={styles.lastMessageTime}>{formatMessageTimestamp(conversation.lastMessageAt)}</Text> : null}
                </View>
              </Pressable>
              <Pressable accessibilityLabel={`Delete conversation with ${conversation.personName}`} accessibilityRole="button" disabled={isDeleting} onPress={() => deleteConversation(conversation)} style={styles.deleteConversationButton}>
                {isDeleting ? <ActivityIndicator color={colors.brown} size="small" /> : <Text style={styles.deleteConversationText}>×</Text>}
              </Pressable>
            </View>;
          })
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setConversationPendingDeletion(null)}
        transparent
        visible={conversationPendingDeletion !== null}
      >
        <View style={styles.deleteModalBackdrop}>
          <View accessibilityRole="alert" style={styles.deleteModal}>
            <Text style={styles.deleteModalTitle}>Delete conversation?</Text>
            <Text style={styles.deleteModalText}>
              {conversationPendingDeletion
                ? `This permanently deletes your conversation with ${conversationPendingDeletion.personName} for both of you.`
                : ''}
            </Text>
            <View style={styles.deleteModalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={deletingConversationId !== null}
                onPress={() => setConversationPendingDeletion(null)}
                style={styles.cancelDeleteButton}
              >
                <Text style={styles.cancelDeleteText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={deletingConversationId !== null || conversationPendingDeletion === null}
                onPress={() => {
                  if (conversationPendingDeletion) {
                    void confirmDeleteConversation(conversationPendingDeletion.id);
                  }
                }}
                style={[styles.confirmDeleteButton, deletingConversationId !== null && styles.deleteButtonDisabled]}
              >
                {deletingConversationId ? <ActivityIndicator color={colors.warmWhite} size="small" /> : <Text style={styles.confirmDeleteText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { flexGrow: 1, padding: 20 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 10 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 30, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  emptyCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 24, padding: 18, ...shadows.card },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  conversationCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 14, paddingLeft: 16, ...shadows.card },
  conversationCardUnread: { backgroundColor: '#FFF9EF', borderColor: '#141414', borderWidth: 3 },
  profileButton: { alignItems: 'center', justifyContent: 'center', minHeight: 74, paddingVertical: 11 },
  conversationOpenButton: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 74, paddingVertical: 16 },
  conversationContent: { flex: 1, marginLeft: 12 },
  conversationTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  newMessageLabel: { alignSelf: 'flex-start', backgroundColor: '#141414', borderRadius: 8, color: colors.warmWhite, fontSize: 10, fontWeight: '900', letterSpacing: 0.6, marginTop: 6, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  lastMessageTime: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 4 },
  deleteConversationButton: { alignItems: 'center', justifyContent: 'center', minHeight: 54, width: 46 },
  deleteConversationText: { color: colors.brown, fontSize: 28, fontWeight: '400', lineHeight: 30 },
  deleteModalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'center', padding: 24 },
  deleteModal: { backgroundColor: colors.warmWhite, borderRadius: 20, maxWidth: 420, padding: 22, width: '100%' },
  deleteModalTitle: { color: colors.forest, fontSize: 21, fontWeight: '900' },
  deleteModalText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 9 },
  deleteModalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  cancelDeleteButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  cancelDeleteText: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  confirmDeleteButton: { alignItems: 'center', backgroundColor: '#B42318', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 48 },
  confirmDeleteText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  deleteButtonDisabled: { opacity: 0.6 },
});
