-- Messages can only be permanently removed by the person who sent them.
create policy "Message senders can delete their own messages"
on public.property_messages
for delete
to authenticated
using (sender_id = (select auth.uid()));

grant delete on table public.property_messages to authenticated;
