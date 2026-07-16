-- Keep deleted guest history for 30 days, then permanently remove only the
-- messages that existed at the time the guest profile was deleted. Messages
-- sent after a guest returns remain in the shared conversation.
create extension if not exists pg_cron;

create index if not exists property_conversations_guest_history_cleared_at_index
  on public.property_conversations (guest_history_cleared_at)
  where guest_history_cleared_at is not null;

create or replace function private.purge_expired_guest_message_history()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  expired_conversation record;
begin
  for expired_conversation in
    select id, guest_history_cleared_at
    from public.property_conversations
    where guest_history_cleared_at <= now() - interval '30 days'
    for update skip locked
  loop
    -- Remove the attachment objects before removing their message rows.
    delete from storage.objects as object
    where object.bucket_id = 'message-images'
      and object.name in (
        select message.image_path
        from public.property_messages as message
        where message.conversation_id = expired_conversation.id
          and message.created_at <= expired_conversation.guest_history_cleared_at
          and message.image_path is not null
      );

    delete from public.property_messages as message
    where message.conversation_id = expired_conversation.id
      and message.created_at <= expired_conversation.guest_history_cleared_at;

    if exists (
      select 1
      from public.property_messages as message
      where message.conversation_id = expired_conversation.id
    ) then
      update public.property_conversations
      set guest_history_cleared_at = null
      where id = expired_conversation.id;
    else
      delete from public.property_conversations
      where id = expired_conversation.id;
    end if;
  end loop;
end;
$$;

revoke all on function private.purge_expired_guest_message_history() from public, anon, authenticated;

drop policy if exists "Conversation participants view message images" on storage.objects;
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
      and (
        property_conversations.host_id = (select auth.uid())
        or (
          property_conversations.guest_id = (select auth.uid())
          and (
            property_conversations.guest_history_cleared_at is null
            or property_messages.created_at > property_conversations.guest_history_cleared_at
          )
        )
      )
  )
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-guest-message-history';

select cron.schedule(
  'purge-expired-guest-message-history',
  '15 3 * * *',
  'select private.purge_expired_guest_message_history();'
);
