import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, shadows, typography } from '../../../constants/theme';
import { ConversationAvatar } from '../../../components/conversation-avatar';
import { supabase } from '../../../lib/supabase';
import { ensureMessagingSession } from '../../../lib/anonymous-session';
import { formatMessageTimestamp, getUnreadMessageIds, markConversationRead } from '../../../lib/messaging';
import { useAuth } from '../../../services/auth-context';
import type { MessageReaction, MessageReactionKind, PropertyConversation, PropertyMessage } from '../../../types/messaging';

type ThreadProperty = { id: string; name: string; host_id: string; is_published: boolean };
type MessageWithImage = PropertyMessage & { imageUrl?: string };
const reactionOptions: { kind: MessageReactionKind; symbol: string; label: string }[] = [
  { kind: 'like', symbol: '👍', label: 'Thumbs up' },
  { kind: 'dislike', symbol: '👎', label: 'Thumbs down' },
  { kind: 'love', symbol: '♥', label: 'Love' },
];

export default function PropertyMessageThreadScreen() {
  const { propertyId, conversationId } = useLocalSearchParams<{
    propertyId: string;
    conversationId?: string;
  }>();
  const { session } = useAuth();
  const [property, setProperty] = useState<ThreadProperty | null>(null);
  const [conversation, setConversation] = useState<PropertyConversation | null>(null);
  const [messages, setMessages] = useState<MessageWithImage[]>([]);
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, MessageReaction[]>>({});
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [participantImageUrls, setParticipantImageUrls] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(
    session?.user.id ?? null
  );
  const composerInputRef = useRef<TextInput | null>(null);
  const activeConversationId = conversation?.id ?? null;

  const loadMessages = useCallback(async (activeConversationId: string) => {
    const { data, error } = await supabase
      .from('property_messages')
      .select('*')
      .eq('conversation_id', activeConversationId)
      .order('created_at');

    if (error) {
      Alert.alert('Unable to load messages', error.message);
      return;
    }

    const messageRows = (data ?? []) as PropertyMessage[];
    const imagePaths = messageRows
      .map((message) => message.image_path)
      .filter((path): path is string => Boolean(path));
    const { data: signedUrls } = imagePaths.length
      ? await supabase.storage.from('message-images').createSignedUrls(imagePaths, 60 * 60)
      : { data: [] as { path: string; signedUrl: string }[] };
    const urlsByPath = new Map<string, string>(
      (signedUrls ?? []).flatMap((file) =>
        file.path && file.signedUrl ? [[file.path, file.signedUrl]] : []
      )
    );

    const { data: reactionRows, error: reactionError } = messageRows.length
      ? await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageRows.map((message) => message.id))
      : { data: [], error: null };

    if (reactionError) {
      Alert.alert('Unable to load reactions', reactionError.message);
    }

    setMessages(messageRows.map((message) => ({ ...message, imageUrl: message.image_path ? urlsByPath.get(message.image_path) : undefined })));
    setReactionsByMessage(
      ((reactionRows ?? []) as MessageReaction[]).reduce<Record<string, MessageReaction[]>>((grouped, reaction) => {
        grouped[reaction.message_id] = [...(grouped[reaction.message_id] ?? []), reaction];
        return grouped;
      }, {})
    );
    await markConversationRead(activeConversationId);
  }, []);

  const loadThread = useCallback(async () => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const activeSession = await ensureMessagingSession(session);
      const activeUser = activeSession.user;
      setActiveUserId(activeUser.id);

      const displayName = activeUser.is_anonymous
        ? 'Guest'
        : typeof activeUser.user_metadata?.full_name === 'string'
          ? activeUser.user_metadata.full_name
          : activeUser.email?.split('@')[0] ?? 'K9 Country Member';
      await supabase
        .from('messaging_profiles')
        .upsert(
          { user_id: activeUser.id, display_name: displayName.trim() },
          { onConflict: 'user_id' }
        );

      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('id, name, host_id, is_published')
        .eq('id', propertyId)
        .maybeSingle();

      if (propertyError || !propertyData) {
        Alert.alert('Property unavailable', propertyError?.message ?? 'This property could not be found.');
        router.back();
        return;
      }

      const activeProperty = propertyData as ThreadProperty;
      setProperty(activeProperty);

      if (activeProperty.host_id === activeUser.id && !conversationId) {
        router.replace(`/host-messages?propertyId=${propertyId}&propertyName=${encodeURIComponent(activeProperty.name)}` as never);
        return;
      }

      let activeConversation: PropertyConversation | null = null;

      if (conversationId) {
        const { data, error } = await supabase
          .from('property_conversations')
          .select('*')
          .eq('id', conversationId)
          .maybeSingle();
        if (error) {
          throw error;
        }
        activeConversation = data as PropertyConversation | null;
      } else {
        const { data: existing, error: existingError } = await supabase
          .from('property_conversations')
          .select('*')
          .eq('host_id', activeProperty.host_id)
          .eq('guest_id', activeUser.id)
          .maybeSingle();
        if (existingError) {
          throw existingError;
        }
        activeConversation = existing as PropertyConversation | null;

        if (!activeConversation) {
          const { data: created, error: createError } = await supabase
            .from('property_conversations')
            .insert({
              property_id: propertyId,
              guest_id: activeUser.id,
              host_id: activeProperty.host_id,
            })
            .select('*')
            .single();

          if (createError && createError.code !== '23505') {
            throw createError;
          } else if (created) {
            activeConversation = created as PropertyConversation;
          } else {
            const { data: retried, error: retryError } = await supabase
              .from('property_conversations')
              .select('*')
              .eq('host_id', activeProperty.host_id)
              .eq('guest_id', activeUser.id)
              .maybeSingle();
            if (retryError) {
              throw retryError;
            }
            activeConversation = retried as PropertyConversation | null;
          }
        }
      }

      if (activeConversation) {
        setConversation(activeConversation);
        const otherUserId = activeConversation.guest_id === activeUser.id
          ? activeConversation.host_id
          : activeConversation.guest_id;
        const { data: profiles } = await supabase
          .from('messaging_profiles')
          .select('user_id, display_name')
          .in('user_id', [activeConversation.guest_id, activeConversation.host_id]);
        setParticipantNames({
          [activeUser.id]: displayName.trim(),
          ...Object.fromEntries((profiles ?? []).map((profile) => [profile.user_id, profile.display_name])),
        });
        const { data: avatarPaths } = await supabase.rpc(
          'get_conversation_profile_images',
          { target_user_ids: [otherUserId] }
        );
        setParticipantImageUrls(
          Object.fromEntries(
            ((avatarPaths ?? []) as { bucket_id: string; profile_image_path: string; user_id: string }[]).map((avatar) => [
              avatar.user_id,
              supabase.storage
                .from(avatar.bucket_id)
                .getPublicUrl(avatar.profile_image_path).data.publicUrl,
            ])
          )
        );
        await loadMessages(activeConversation.id);
      }
    } catch (error) {
      Alert.alert(
        'Unable to open conversation',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    conversationId,
    loadMessages,
    propertyId,
    session,
  ]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!conversation) return;
    const refresh = setInterval(() => void loadMessages(conversation.id), 10_000);
    return () => clearInterval(refresh);
  }, [conversation, loadMessages]);

  useEffect(() => {
    if (!activeConversationId) return;
    const timer = setTimeout(() => {
      composerInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [activeConversationId]);

  const sendMessage = async () => {
    if (!conversation || !activeUserId || !draft.trim() || isSending) return;

    try {
      setIsSending(true);
      const { data, error } = await supabase
        .from('property_messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: activeUserId,
          message_text: draft.trim(),
        })
        .select('*')
        .single();
      if (error) throw error;
      setDraft('');
      setMessages((current) => [...current, data as PropertyMessage]);
    } catch (error) {
      Alert.alert('Unable to send message', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const uploadMessageImage = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!conversation || !activeUserId || isUploadingImage) return;

    const extension = (asset.mimeType?.split('/')[1] ?? 'jpg')
      .replace('jpeg', 'jpg')
      .replace(/[^a-z0-9]/gi, '') || 'jpg';
    const path = `${conversation.id}/${activeUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    try {
      setIsUploadingImage(true);
      const response = await fetch(asset.uri);
      const { error: uploadError } = await supabase.storage
        .from('message-images')
        .upload(path, await response.arrayBuffer(), {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { error: messageError } = await supabase.from('property_messages').insert({
        conversation_id: conversation.id,
        sender_id: activeUserId,
        message_text: null,
        image_path: path,
      });
      if (messageError) {
        await supabase.storage.from('message-images').remove([path]);
        throw messageError;
      }
      await loadMessages(conversation.id);
    } catch (error) {
      Alert.alert('Unable to send photo', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const chooseMessageImage = async () => {
    if (isUploadingImage) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to share an image in this conversation.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) await uploadMessageImage(result.assets[0]);
  };

  const takeMessageImage = async () => {
    if (isUploadingImage) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to take a photo for this conversation.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) await uploadMessageImage(result.assets[0]);
  };

  const toggleReaction = async (messageId: string, reaction: MessageReactionKind) => {
    if (!activeUserId) return;

    const currentReaction = (reactionsByMessage[messageId] ?? []).find(
      (item) => item.user_id === activeUserId
    );

    try {
      if (currentReaction?.reaction === reaction) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', activeUserId);
        if (error) throw error;
        setReactionsByMessage((current) => ({
          ...current,
          [messageId]: (current[messageId] ?? []).filter((item) => item.user_id !== activeUserId),
        }));
        return;
      }

      const { data, error } = await supabase
        .from('message_reactions')
        .upsert(
          { message_id: messageId, reaction, user_id: activeUserId },
          { onConflict: 'message_id,user_id' }
        )
        .select('*')
        .single();
      if (error) throw error;

      const savedReaction = data as MessageReaction;
      setReactionsByMessage((current) => ({
        ...current,
        [messageId]: [
          ...(current[messageId] ?? []).filter((item) => item.user_id !== activeUserId),
          savedReaction,
        ],
      }));
    } catch (error) {
      Alert.alert('Unable to add reaction', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  if (isLoading) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={colors.forest} size="large" /><Text style={styles.centeredText}>Opening conversation...</Text></View></SafeAreaView>;
  }

  if (!property || !conversation) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.centeredText}>This conversation is unavailable.</Text></View></SafeAreaView>;
  }

  const otherUserId = conversation.guest_id === activeUserId
    ? conversation.host_id
    : conversation.guest_id;
  const isHostViewer = conversation.host_id === activeUserId;
  const otherParticipantName = participantNames[otherUserId] ?? (isHostViewer ? 'Guest' : 'Host');
  const unreadMessageIds = activeUserId
    ? getUnreadMessageIds(messages, conversation, activeUserId)
    : new Set<string>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>{'<'}</Text></Pressable>
          {isHostViewer ? (
            <Pressable
              accessibilityLabel={`View ${otherParticipantName}'s guest profile`}
              accessibilityRole="button"
              onPress={() => router.push(`/host-guests/${otherUserId}?guestName=${encodeURIComponent(otherParticipantName)}` as never)}
              style={styles.participantHeader}
            >
              <ConversationAvatar hasUnread={false} imageUrl={participantImageUrls[otherUserId]} name={otherParticipantName} />
              <View style={styles.headerText}>
                <Text numberOfLines={1} style={styles.title}>{otherParticipantName}</Text>
                <Text style={styles.profileHint}>View guest profile</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={`View ${otherParticipantName}'s host profile`}
              accessibilityRole="button"
              onPress={() => router.push(`/host-profile/${otherUserId}` as never)}
              style={styles.participantHeader}
            >
              <ConversationAvatar hasUnread={false} imageUrl={participantImageUrls[otherUserId]} name={otherParticipantName} />
              <View style={styles.headerText}>
                <Text numberOfLines={1} style={styles.title}>{otherParticipantName}</Text>
                <Text style={styles.profileHint}>View host profile</Text>
              </View>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.messageList} showsVerticalScrollIndicator={false}>
          {messages.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Start the conversation</Text><Text style={styles.emptyText}>This is your shared conversation with the host, across all of their private spaces.</Text></View> : null}
          {messages.map((message) => {
            const sentByMe = message.sender_id === activeUserId;
            const isNewIncomingMessage = unreadMessageIds.has(message.id);
            const messageReactions = reactionsByMessage[message.id] ?? [];
            const myReaction = messageReactions.find((reaction) => reaction.user_id === activeUserId)?.reaction;
            return (
              <View key={message.id} style={[styles.messageBubble, sentByMe ? styles.myMessage : styles.theirMessage, isNewIncomingMessage && styles.newIncomingMessage]}>
                <Text style={[styles.messageSender, sentByMe && styles.myMessageText]}>{participantNames[message.sender_id] ?? 'K9 Country member'}</Text>
                {isNewIncomingMessage ? <Text style={styles.newMessageLabel}>NEW MESSAGE</Text> : null}
                {message.imageUrl ? <Image accessibilityLabel="Shared message photo" contentFit="cover" source={{ uri: message.imageUrl }} style={styles.messageImage} /> : null}
                {message.message_text ? <Text style={[styles.messageText, sentByMe && styles.myMessageText]}>{message.message_text}</Text> : null}
                <Text style={[styles.messageTimestamp, sentByMe && styles.myMessageTimestamp]}>{formatMessageTimestamp(message.created_at)}</Text>
                <View style={styles.reactionBar}>
                  {reactionOptions.map((option) => {
                    const count = messageReactions.filter((reaction) => reaction.reaction === option.kind).length;
                    const selected = myReaction === option.kind;
                    return (
                      <Pressable
                        accessibilityLabel={`${option.label}${selected ? ', selected' : ''}`}
                        accessibilityRole="button"
                        key={option.kind}
                        onPress={() => void toggleReaction(message.id, option.kind)}
                        style={[styles.reactionButton, selected && styles.reactionButtonSelected]}
                      >
                        <Text style={[styles.reactionSymbol, option.kind === 'love' && styles.loveReaction]}>{option.symbol}</Text>
                        {count > 0 ? <Text style={[styles.reactionCount, selected && styles.reactionCountSelected]}>{count}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.composer}>
          <View style={styles.attachmentActions}>
            <Pressable accessibilityLabel="Choose a photo to share" accessibilityRole="button" disabled={isUploadingImage} onPress={() => void chooseMessageImage()} style={[styles.attachmentButton, isUploadingImage && styles.disabled]}>
              <Text style={styles.attachmentButtonText}>Photo</Text>
            </Pressable>
            <Pressable accessibilityLabel="Take a photo to share" accessibilityRole="button" disabled={isUploadingImage} onPress={() => void takeMessageImage()} style={[styles.attachmentButton, isUploadingImage && styles.disabled]}>
              {isUploadingImage ? <ActivityIndicator color={colors.brown} size="small" /> : <Text style={styles.attachmentButtonText}>Camera</Text>}
            </Pressable>
          </View>
          <View style={styles.composerRow}>
            <TextInput
              ref={composerInputRef}
              accessibilityLabel="Message"
              autoFocus
              maxLength={2000}
              multiline
              onChangeText={setDraft}
              placeholder="Write a message..."
              placeholderTextColor="#8A877D"
              style={styles.composerInput}
              value={draft}
            />
            <Pressable disabled={!draft.trim() || isSending || isUploadingImage} onPress={sendMessage} style={[styles.sendButton, (!draft.trim() || isSending || isUploadingImage) && styles.disabled]}>{isSending ? <ActivityIndicator color="#FFFDF8" size="small" /> : <Text style={styles.sendButtonText}>Send</Text>}</Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, flex: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 }, centeredText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  header: { alignItems: 'center', backgroundColor: colors.warmWhite, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', padding: 16 }, backButton: { alignItems: 'center', justifyContent: 'center', marginRight: 12, minHeight: 40, width: 32 }, backButtonText: { color: colors.forest, fontSize: 28, fontWeight: '800' }, participantHeader: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 52 }, headerText: { flex: 1, marginLeft: 10 }, title: { color: colors.forest, fontFamily: typography.display, fontSize: 18, fontWeight: '900' }, profileHint: { color: colors.brown, fontSize: 12, fontWeight: '800', marginTop: 2 },
  messageList: { flexGrow: 1, gap: 10, padding: 16 }, emptyCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 16, ...shadows.card }, emptyTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  messageBubble: { borderRadius: 16, maxWidth: '82%', padding: 12 }, myMessage: { alignSelf: 'flex-end', backgroundColor: colors.forest }, theirMessage: { alignSelf: 'flex-start', backgroundColor: colors.warmWhite, borderColor: colors.border, borderWidth: 1 }, newIncomingMessage: { borderColor: '#141414', borderWidth: 3 }, messageSender: { color: colors.brown, fontSize: 11, fontWeight: '900', marginBottom: 4 }, newMessageLabel: { alignSelf: 'flex-start', backgroundColor: '#141414', borderRadius: 8, color: colors.warmWhite, fontSize: 10, fontWeight: '900', letterSpacing: 0.6, marginBottom: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 }, messageText: { color: colors.forest, fontSize: 15, lineHeight: 21 }, myMessageText: { color: colors.warmWhite }, messageImage: { borderRadius: 10, height: 220, marginBottom: 8, width: 220 }, messageTimestamp: { color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 8 }, myMessageTimestamp: { color: '#E4EDE0' }, reactionBar: { flexDirection: 'row', gap: 6, marginTop: 10 }, reactionButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 30, minWidth: 34, paddingHorizontal: 8 }, reactionButtonSelected: { backgroundColor: colors.lightGreen, borderColor: colors.forest }, reactionSymbol: { fontSize: 14 }, loveReaction: { color: '#B52E35', fontSize: 17 }, reactionCount: { color: colors.forest, fontSize: 12, fontWeight: '900', marginLeft: 4 }, reactionCountSelected: { color: colors.forest },
  composer: { backgroundColor: colors.warmWhite, borderTopColor: colors.border, borderTopWidth: 1, gap: 8, padding: 12 }, attachmentActions: { flexDirection: 'row', gap: 8 }, attachmentButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 32, paddingHorizontal: 12 }, attachmentButtonText: { color: colors.brown, fontSize: 12, fontWeight: '900' }, composerRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 }, composerInput: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, flex: 1, fontSize: 15, maxHeight: 112, minHeight: 48, paddingHorizontal: 12, paddingTop: 12, textAlignVertical: 'top' }, sendButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 }, sendButtonText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.55 },
});
