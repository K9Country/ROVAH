import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, shadows, typography } from '../../constants/theme';
import { ConversationAvatar } from '../../components/conversation-avatar';
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

export default function MessagesScreen() {
  const { session } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!session?.user.id) {
      setConversations([]);
      setUnreadConversationIds(new Set());
      return;
    }

    const displayName =
      typeof session.user.user_metadata?.full_name === 'string'
        ? session.user.user_metadata.full_name
        : session.user.email?.split('@')[0] ?? 'K9 Country Member';

    await supabase
      .from('messaging_profiles')
      .upsert(
        { user_id: session.user.id, display_name: displayName.trim() },
        { onConflict: 'user_id' }
      );

    const { data } = await supabase
      .from('property_conversations')
      .select('*')
      .eq('guest_id', session.user.id)
      .order('created_at', { ascending: false });

    const rows = (data ?? []) as PropertyConversation[];
    const hostIds = [...new Set(rows.map((row) => row.host_id))];

    const [{ data: profiles }, { data: avatarPaths }, unreadIds, lastMessageTimes] = await Promise.all([
      hostIds.length
        ? supabase
            .from('messaging_profiles')
            .select('user_id, display_name')
            .in('user_id', hostIds)
        : Promise.resolve({ data: [] as { user_id: string; display_name: string }[] }),
      hostIds.length
        ? supabase.rpc('get_conversation_profile_images', { target_user_ids: hostIds })
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
      rows
        .filter((row) => !row.guest_history_cleared_at || lastMessageTimes.has(row.id))
        .map((row) => ({
        ...row,
        personName: people.get(row.host_id) ?? 'Host',
        profileImageUrl: avatarUrls.get(row.host_id),
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
    Alert.alert('Delete conversation?', `This will permanently delete your conversation with ${conversation.personName} for both of you.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void confirmDeleteConversation(conversation.id) },
    ]);
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
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Dashboard</Text>
        </Pressable>

        <Text style={styles.title}>Messages</Text>

        {conversations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>
              From Discover, use Message Host to begin a conversation before
              reserving a private space.
            </Text>
          </View>
        ) : (
          conversations.map((conversation) => {
            const hasUnread = unreadConversationIds.has(conversation.id);
            const isDeleting = deletingConversationId === conversation.id;

            return <View key={conversation.id} style={styles.conversationCard}>
              <Pressable
                accessibilityLabel={`View ${conversation.personName}'s host profile`}
                accessibilityRole="button"
                onPress={() => router.push(`/host-profile/${conversation.host_id}` as never)}
                style={styles.profileButton}
              >
                <ConversationAvatar hasUnread={hasUnread} imageUrl={conversation.profileImageUrl} name={conversation.personName} />
              </Pressable>
              <Pressable onPress={() => router.push(`/messages/${conversation.property_id}?conversationId=${conversation.id}` as never)} style={styles.conversationOpenButton}>
                <View style={styles.conversationContent}>
                  <Text style={styles.conversationTitle}>{conversation.personName}</Text>
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
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 30, fontWeight: '900', marginTop: 8 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 10 },
  emptyCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 24, padding: 18, ...shadows.card },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  conversationCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 14, paddingLeft: 16, ...shadows.card },
  profileButton: { alignItems: 'center', justifyContent: 'center', minHeight: 74, paddingVertical: 11 },
  conversationOpenButton: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 74, paddingVertical: 16 },
  conversationContent: { flex: 1, marginLeft: 12 },
  conversationTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  lastMessageTime: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 4 },
  deleteConversationButton: { alignItems: 'center', justifyContent: 'center', minHeight: 54, width: 46 },
  deleteConversationText: { color: colors.brown, fontSize: 28, fontWeight: '400', lineHeight: 30 },
});
