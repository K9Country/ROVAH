import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function datesInCalendarMonth(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

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
  const [showResolutionOffer, setShowResolutionOffer] = useState(false);
  const [resolutionKind, setResolutionKind] = useState<'discount' | 'courtesy'>('discount');
  const [resolutionDiscountPercent, setResolutionDiscountPercent] = useState('20');
  const [resolutionCourtesyHours, setResolutionCourtesyHours] = useState('1');
  const [resolutionExpiresAt, setResolutionExpiresAt] = useState(() => new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10));
  const [showExpirationPicker, setShowExpirationPicker] = useState(false);
  const [expirationCalendarMonth, setExpirationCalendarMonth] = useState(() => new Date(Date.now() + 90 * 86_400_000));
  const [resolutionNote, setResolutionNote] = useState('');
  const [isIssuingResolution, setIsIssuingResolution] = useState(false);
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
          : activeUser.email?.split('@')[0] ?? 'ROVAH Member';
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
      void supabase.functions
        .invoke('notify-app-email', { body: { type: 'message_created', resourceId: data.id } })
        .then(({ error: notificationError }) => {
          if (notificationError) console.warn('Message notification email was not sent:', notificationError.message);
        })
        .catch((notificationError) => console.warn('Message notification email was not sent:', notificationError));
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

      const { data: message, error: messageError } = await supabase
        .from('property_messages')
        .insert({
          conversation_id: conversation.id,
          sender_id: activeUserId,
          message_text: null,
          image_path: path,
        })
        .select('id')
        .single();
      if (messageError) {
        await supabase.storage.from('message-images').remove([path]);
        throw messageError;
      }
      void supabase.functions
        .invoke('notify-app-email', { body: { type: 'message_created', resourceId: message.id } })
        .then(({ error: notificationError }) => {
          if (notificationError) console.warn('Message notification email was not sent:', notificationError.message);
        })
        .catch((notificationError) => console.warn('Message notification email was not sent:', notificationError));
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

  const issueResolutionOffer = async () => {
    if (!property || !conversation || !isHostViewer || isIssuingResolution) return;
    const amount = Number(resolutionKind === 'discount' ? resolutionDiscountPercent : resolutionCourtesyHours);

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter an amount', resolutionKind === 'discount' ? 'Enter a discount between 1% and 82%.' : 'Enter the number of free hours to offer.');
      return;
    }
    if (resolutionKind === 'discount' && amount > 82) {
      Alert.alert('Maximum discount is 82%', 'At 82%, the member covers the 18% ROVAH platform fee and the host receives $0. Use a Courtesy Waiver for a completely free visit.');
      return;
    }
    if (resolutionKind === 'courtesy' && amount > 100) {
      Alert.alert('Maximum Courtesy Waiver is 100 hours', 'Enter a smaller number of free hours.');
      return;
    }
    if (resolutionKind === 'discount' && (!/^\d{4}-\d{2}-\d{2}$/.test(resolutionExpiresAt) || Number.isNaN(new Date(`${resolutionExpiresAt}T12:00:00`).getTime()))) {
      Alert.alert('Enter a valid expiration date', 'Use the format YYYY-MM-DD.');
      return;
    }

    try {
      setIsIssuingResolution(true);
      const { error } = resolutionKind === 'discount'
        ? await supabase.rpc('issue_resolution_discount', {
          p_property_id: property.id,
          p_member_id: conversation.guest_id,
          p_discount_percent: amount,
          p_expires_at: resolutionExpiresAt,
          p_note: resolutionNote.trim() || null,
        })
        : await supabase.rpc('issue_courtesy_visit', {
          p_property_id: property.id,
          p_member_id: conversation.guest_id,
          p_hours: amount,
          p_expires_at: resolutionExpiresAt,
          p_note: resolutionNote.trim() || null,
        });
      if (error) throw error;

      setShowResolutionOffer(false);
      setResolutionNote('');
      await loadMessages(conversation.id);
      Alert.alert(
        resolutionKind === 'discount' ? 'Special Discount sent' : 'Courtesy Waiver sent',
        resolutionKind === 'discount'
          ? `The guest can use this ${amount}% discount on their next reservation at ${property.name}.`
          : `The guest can use these ${amount} free hour${amount === 1 ? '' : 's'} only at ${property.name}. It expires seven days after sending.`
      );
    } catch (error) {
      Alert.alert('Unable to send offer', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsIssuingResolution(false);
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
          {isHostViewer ? <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>{'<'}</Text></Pressable> : null}
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
          {isHostViewer ? <Pressable accessibilityLabel="Special / Gift" accessibilityRole="button" onPress={() => setShowResolutionOffer(true)} style={styles.resolutionHeaderButton}><Text style={styles.resolutionHeaderButtonText}>Special / Gift</Text></Pressable> : null}
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
                <Text style={[styles.messageSender, sentByMe && styles.myMessageText]}>{participantNames[message.sender_id] ?? 'ROVAH member'}</Text>
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
                        style={[styles.reactionButton, !selected && styles.reactionButtonUnselected, selected && styles.reactionButtonSelected]}
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
              <Text style={styles.attachmentButtonText}>Upload Photo</Text>
            </Pressable>
            <Pressable accessibilityLabel="Take a photo to share" accessibilityRole="button" disabled={isUploadingImage} onPress={() => void takeMessageImage()} style={[styles.attachmentButton, isUploadingImage && styles.disabled]}>
              {isUploadingImage ? <ActivityIndicator color={colors.brown} size="small" /> : <View pointerEvents="none" style={styles.attachmentCameraIcon}><View style={styles.attachmentCameraIconTop} /><View style={styles.attachmentCameraIconLens} /></View>}
            </Pressable>
          </View>
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
      </KeyboardAvoidingView>

      <Modal animationType="slide" transparent visible={showResolutionOffer} onRequestClose={() => setShowResolutionOffer(false)}>
        <Pressable onPress={() => setShowResolutionOffer(false)} style={styles.offerModalBackdrop}>
          <Pressable onPress={() => undefined} style={styles.offerSheet}>
            <Text style={styles.offerTitle}>Special Gift for Your Guest</Text>
            <Text style={styles.offerIntro}>Send a one-time offer for {property.name}. The guest will receive it in this conversation and see it automatically during their next reservation for this space.</Text>
            <View style={styles.offerKindRow}>
              <Pressable accessibilityRole="button" onPress={() => setResolutionKind('discount')} style={[styles.offerKindButton, resolutionKind === 'discount' && styles.offerKindButtonSelected]}><Text style={[styles.offerKindTitle, resolutionKind === 'discount' && styles.offerKindTitleSelected]}>Special Discount</Text><Text style={[styles.offerKindText, resolutionKind === 'discount' && styles.offerKindTextSelected]}>Guest pays less; ROVAH keeps 18% of the original rate.</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setResolutionKind('courtesy')} style={[styles.offerKindButton, resolutionKind === 'courtesy' && styles.offerKindButtonSelected]}><Text style={[styles.offerKindTitle, resolutionKind === 'courtesy' && styles.offerKindTitleSelected]}>Courtesy Waiver</Text><Text style={[styles.offerKindText, resolutionKind === 'courtesy' && styles.offerKindTextSelected]}>A free visit for this site, valid for seven days. You may issue one to this guest each calendar month.</Text></Pressable>
            </View>
            <Text style={styles.offerFieldLabel}>{resolutionKind === 'discount' ? 'Discount percentage (1–82%)' : 'Free hours'}</Text>
            <TextInput keyboardType="decimal-pad" onChangeText={resolutionKind === 'discount' ? setResolutionDiscountPercent : setResolutionCourtesyHours} style={styles.offerInput} value={resolutionKind === 'discount' ? resolutionDiscountPercent : resolutionCourtesyHours} />
            {resolutionKind === 'discount' ? <><Text style={styles.offerFieldLabel}>Expiration date</Text><Pressable accessibilityLabel="Select offer expiration date" accessibilityRole="button" onPress={() => setShowExpirationPicker(true)} style={styles.expirationSelectButton}><Text style={styles.expirationSelectText}>{new Date(`${resolutionExpiresAt}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text><Text style={styles.expirationSelectHint}>Select date</Text></Pressable></> : <Text style={styles.offerPolicyNote}>Courtesy Waivers automatically expire seven days after you send them. They can only be used at {property.name}.</Text>}
            <Text style={styles.offerFieldLabel}>Message for the guest (optional)</Text>
            <TextInput maxLength={280} multiline onChangeText={setResolutionNote} placeholder="Add a brief note..." placeholderTextColor="#8A877D" style={[styles.offerInput, styles.offerNoteInput]} value={resolutionNote} />
            <Pressable disabled={isIssuingResolution} onPress={() => void issueResolutionOffer()} style={[styles.offerSubmitButton, isIssuingResolution && styles.disabled]}>{isIssuingResolution ? <ActivityIndicator color={colors.warmWhite} /> : <Text style={styles.offerSubmitText}>{resolutionKind === 'discount' ? 'Send Special Discount' : 'Send Courtesy Waiver'}</Text>}</Pressable>
            <Pressable onPress={() => setShowResolutionOffer(false)} style={styles.offerCancelButton}><Text style={styles.offerCancelText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" transparent visible={showExpirationPicker} onRequestClose={() => setShowExpirationPicker(false)}>
        <Pressable onPress={() => setShowExpirationPicker(false)} style={styles.datePickerBackdrop}>
          <Pressable onPress={() => undefined} style={styles.datePickerCard}>
            <Text style={styles.datePickerTitle}>Choose an expiration date</Text>
            <View style={styles.datePickerMonthRow}>
              <Pressable accessibilityLabel="Previous month" onPress={() => setExpirationCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.datePickerMonthButton}><Text style={styles.datePickerMonthButtonText}>‹</Text></Pressable>
              <Text style={styles.datePickerMonthTitle}>{monthNames[expirationCalendarMonth.getMonth()]} {expirationCalendarMonth.getFullYear()}</Text>
              <Pressable accessibilityLabel="Next month" onPress={() => setExpirationCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.datePickerMonthButton}><Text style={styles.datePickerMonthButtonText}>›</Text></Pressable>
            </View>
            <View style={styles.datePickerWeekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.datePickerWeekday}>{day}</Text>)}</View>
            <View style={styles.datePickerGrid}>{datesInCalendarMonth(expirationCalendarMonth).map((date) => { const inMonth = date.getMonth() === expirationCalendarMonth.getMonth(); const disabled = startOfDay(date) < startOfDay(new Date()); const selected = dateKey(date) === resolutionExpiresAt; return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} key={date.toISOString()} onPress={() => { setResolutionExpiresAt(dateKey(date)); setShowExpirationPicker(false); }} style={[styles.datePickerDay, !inMonth && styles.datePickerDayOutsideMonth, disabled && styles.datePickerDayDisabled, selected && styles.datePickerDaySelected]}><Text style={[styles.datePickerDayText, disabled && styles.datePickerDayTextDisabled, selected && styles.datePickerDayTextSelected]}>{date.getDate()}</Text></Pressable>; })}</View>
            <Pressable onPress={() => setShowExpirationPicker(false)} style={styles.datePickerCancelButton}><Text style={styles.datePickerCancelText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, flex: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 }, centeredText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
  header: { alignItems: 'center', backgroundColor: colors.warmWhite, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16 }, backButton: { alignItems: 'center', justifyContent: 'center', marginRight: 12, minHeight: 40, width: 32 }, memberBackButton: { width: 'auto' }, backButtonText: { color: colors.forest, fontSize: 28, fontWeight: '800' }, memberBackButtonText: { fontSize: 16 }, participantHeader: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 52 }, headerText: { flex: 1, marginLeft: 10 }, title: { color: colors.forest, fontFamily: typography.display, fontSize: 18, fontWeight: '900' }, profileHint: { color: colors.brown, fontSize: 12, fontWeight: '800', marginTop: 2 },
  resolutionHeaderButton: { alignItems: 'center', borderColor: colors.forest, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginLeft: 7, minHeight: 48, paddingHorizontal: 9 }, resolutionHeaderButtonText: { color: colors.forest, fontSize: 11, fontWeight: '900', lineHeight: 14, textAlign: 'center' },
  messageList: { flexGrow: 1, gap: 10, padding: 16 }, emptyCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 16, ...shadows.card }, emptyTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  messageBubble: { borderRadius: 16, maxWidth: '82%', padding: 12 }, myMessage: { alignSelf: 'flex-end', backgroundColor: colors.forest }, theirMessage: { alignSelf: 'flex-start', backgroundColor: colors.warmWhite, borderColor: colors.border, borderWidth: 1 }, newIncomingMessage: { borderColor: '#141414', borderWidth: 3 }, messageSender: { color: colors.brown, fontSize: 11, fontWeight: '900', marginBottom: 4 }, newMessageLabel: { alignSelf: 'flex-start', backgroundColor: '#141414', borderRadius: 8, color: colors.warmWhite, fontSize: 10, fontWeight: '900', letterSpacing: 0.6, marginBottom: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 }, messageText: { color: colors.forest, fontSize: 15, lineHeight: 21 }, myMessageText: { color: colors.warmWhite }, messageImage: { borderRadius: 10, height: 220, marginBottom: 8, width: 220 }, messageTimestamp: { color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 8 }, myMessageTimestamp: { color: '#E4EDE0' }, reactionBar: { flexDirection: 'row', gap: 6, marginTop: 10 }, reactionButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 30, minWidth: 34, paddingHorizontal: 8 }, reactionButtonUnselected: { opacity: 0.5 }, reactionButtonSelected: { backgroundColor: colors.lightGreen, borderColor: colors.forest }, reactionSymbol: { fontSize: 14 }, loveReaction: { color: '#B52E35', fontSize: 17 }, reactionCount: { color: colors.forest, fontSize: 12, fontWeight: '900', marginLeft: 4 }, reactionCountSelected: { color: colors.forest },
  composer: { backgroundColor: colors.warmWhite, borderTopColor: colors.border, borderTopWidth: 1, gap: 10, padding: 12 }, attachmentActions: { flexDirection: 'row', gap: 8 }, attachmentButton: { alignItems: 'center', borderColor: colors.brown, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 32, paddingHorizontal: 12 }, attachmentButtonText: { color: colors.brown, fontSize: 12, fontWeight: '900' }, attachmentCameraIcon: { borderColor: colors.brown, borderRadius: 4, borderWidth: 1.8, height: 16, justifyContent: 'center', position: 'relative', width: 22 }, attachmentCameraIconTop: { backgroundColor: colors.brown, borderTopLeftRadius: 2, borderTopRightRadius: 2, height: 3, left: 4, position: 'absolute', top: -5, width: 8 }, attachmentCameraIconLens: { alignSelf: 'center', borderColor: colors.brown, borderRadius: 5, borderWidth: 1.6, height: 9, width: 9 }, composerInput: { backgroundColor: colors.cream, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.forest, fontSize: 16, lineHeight: 22, maxHeight: 180, minHeight: 104, paddingHorizontal: 14, paddingTop: 13, textAlignVertical: 'top' }, sendButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 }, sendButtonText: { color: colors.warmWhite, fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.55 },
  offerModalBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' }, offerSheet: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '91%', padding: 20 }, offerTitle: { color: colors.forest, fontSize: 23, fontWeight: '900' }, offerIntro: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 }, offerKindRow: { gap: 9, marginTop: 16 }, offerKindButton: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 13 }, offerKindButtonSelected: { backgroundColor: colors.lightGreen, borderColor: colors.forest, borderWidth: 2 }, offerKindTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' }, offerKindTitleSelected: { color: colors.forest }, offerKindText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, offerKindTextSelected: { color: colors.olive }, offerFieldLabel: { color: colors.forest, fontSize: 13, fontWeight: '900', marginTop: 14 }, offerPolicyNote: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.olive, fontSize: 12, fontWeight: '800', lineHeight: 18, marginTop: 14, padding: 10 }, offerInput: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.forest, fontSize: 16, marginTop: 6, minHeight: 48, paddingHorizontal: 13 }, offerNoteInput: { minHeight: 78, paddingTop: 11, textAlignVertical: 'top' }, offerSubmitButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 13, justifyContent: 'center', marginTop: 18, minHeight: 52 }, offerSubmitText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' }, offerCancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 46 }, offerCancelText: { color: colors.brown, fontSize: 15, fontWeight: '900' },
  expirationSelectButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, minHeight: 50, paddingHorizontal: 13 }, expirationSelectText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, expirationSelectHint: { color: colors.brown, fontSize: 12, fontWeight: '900' }, datePickerBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'center', padding: 20 }, datePickerCard: { backgroundColor: colors.cream, borderRadius: 20, maxWidth: 440, padding: 18, width: '100%' }, datePickerTitle: { color: colors.forest, fontSize: 20, fontWeight: '900' }, datePickerMonthRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }, datePickerMonthButton: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 14, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 }, datePickerMonthButtonText: { color: colors.forest, fontSize: 26, fontWeight: '700', lineHeight: 29 }, datePickerMonthTitle: { color: colors.forest, fontSize: 15, fontWeight: '900' }, datePickerWeekRow: { flexDirection: 'row', marginTop: 16 }, datePickerWeekday: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '900', textAlign: 'center' }, datePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, rowGap: 4 }, datePickerDay: { alignItems: 'center', borderRadius: 16, height: 36, justifyContent: 'center', width: '14.2857%' }, datePickerDayOutsideMonth: { opacity: 0.38 }, datePickerDayDisabled: { opacity: 0.24 }, datePickerDaySelected: { backgroundColor: colors.forest }, datePickerDayText: { color: colors.forest, fontSize: 13, fontWeight: '900' }, datePickerDayTextDisabled: { color: colors.muted }, datePickerDayTextSelected: { color: colors.warmWhite }, datePickerCancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 10 }, datePickerCancelText: { color: colors.brown, fontSize: 15, fontWeight: '900' },
});
