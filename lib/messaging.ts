import { supabase } from './supabase';
import type { PropertyConversation, PropertyMessage } from '../types/messaging';

type MessageTimestamp = Pick<
  PropertyMessage,
  'conversation_id' | 'created_at' | 'sender_id'
>;

type ConversationTimestamp = Pick<PropertyMessage, 'conversation_id' | 'created_at'>;

export function formatMessageTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export async function getLastMessageTimes(
  conversations: PropertyConversation[],
  userId: string
) {
  if (conversations.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from('property_messages')
    .select('conversation_id, created_at')
    .in(
      'conversation_id',
      conversations.map((conversation) => conversation.id)
    )
    .order('created_at', { ascending: false });

  if (error) {
    return new Map<string, string>();
  }

  const lastMessageTimes = new Map<string, string>();
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation])
  );

  for (const message of (data ?? []) as ConversationTimestamp[]) {
    const conversation = conversationById.get(message.conversation_id);

    if (
      conversation?.guest_id === userId &&
      conversation.guest_history_cleared_at &&
      new Date(message.created_at).getTime() <=
        new Date(conversation.guest_history_cleared_at).getTime()
    ) {
      continue;
    }

    if (!lastMessageTimes.has(message.conversation_id)) {
      lastMessageTimes.set(message.conversation_id, message.created_at);
    }
  }

  return lastMessageTimes;
}

export async function getUnreadConversationIds(
  conversations: PropertyConversation[],
  userId: string
) {
  if (conversations.length === 0) {
    return new Set<string>();
  }

  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation])
  );
  const { data, error } = await supabase
    .from('property_messages')
    .select('conversation_id, sender_id, created_at')
    .in(
      'conversation_id',
      conversations.map((conversation) => conversation.id)
    )
    .order('created_at', { ascending: false });

  if (error) {
    return new Set<string>();
  }

  const unreadConversationIds = new Set<string>();

  for (const message of (data ?? []) as MessageTimestamp[]) {
    const conversation = conversationById.get(message.conversation_id);

    if (!conversation || message.sender_id === userId) {
      continue;
    }

    const lastReadAt =
      conversation.guest_id === userId
        ? conversation.guest_last_read_at
        : conversation.host_last_read_at;

    if (
      conversation.guest_id === userId &&
      conversation.guest_history_cleared_at &&
      new Date(message.created_at).getTime() <=
        new Date(conversation.guest_history_cleared_at).getTime()
    ) {
      continue;
    }

    if (new Date(message.created_at).getTime() > new Date(lastReadAt).getTime()) {
      unreadConversationIds.add(conversation.id);
    }
  }

  return unreadConversationIds;
}

export async function markConversationRead(conversationId: string) {
  await supabase.rpc('mark_property_conversation_read', {
    target_conversation_id: conversationId,
  });
}
