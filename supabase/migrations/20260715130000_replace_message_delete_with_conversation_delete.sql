-- Conversations are deleted as a whole. Their messages are removed by the
-- existing ON DELETE CASCADE foreign key.
drop policy if exists "Message senders can delete their own messages"
on public.property_messages;

revoke delete on table public.property_messages from authenticated;

create policy "Conversation participants can delete their conversations"
on public.property_conversations
for delete
to authenticated
using (
  guest_id = (select auth.uid())
  or host_id = (select auth.uid())
);

grant delete on table public.property_conversations to authenticated;
