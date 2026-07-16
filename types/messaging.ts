export type PropertyConversation = {
  id: string;
  property_id: string;
  guest_id: string;
  host_id: string;
  guest_last_read_at: string;
  host_last_read_at: string;
  guest_history_cleared_at: string | null;
  created_at: string;
};

export type PropertyMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string | null;
  image_path: string | null;
  created_at: string;
};
