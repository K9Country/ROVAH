alter table public.property_messages
  add column if not exists image_path text;

alter table public.property_messages
  alter column message_text drop not null,
  drop constraint property_messages_message_text_check,
  add constraint property_messages_content_check check (
    (message_text is null or char_length(trim(message_text)) between 1 and 2000)
    and (nullif(trim(message_text), '') is not null or image_path is not null)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-images', 'message-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

create policy "Conversation participants upload message images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-images'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and exists (
    select 1
    from public.property_conversations
    where id::text = (storage.foldername(name))[1]
      and (guest_id = (select auth.uid()) or host_id = (select auth.uid()))
  )
);

create policy "Conversation participants view message images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-images'
  and exists (
    select 1
    from public.property_messages
    join public.property_conversations on property_conversations.id = property_messages.conversation_id
    where property_messages.image_path = storage.objects.name
      and (property_conversations.guest_id = (select auth.uid()) or property_conversations.host_id = (select auth.uid()))
  )
);
