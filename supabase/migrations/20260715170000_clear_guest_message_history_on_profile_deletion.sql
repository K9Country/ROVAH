-- Keep the host's conversation record while preventing a guest who deletes
-- their profile from seeing any messages sent before the deletion.
alter table public.property_conversations
  add column if not exists guest_history_cleared_at timestamptz;

create or replace function private.clear_guest_message_history_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.property_conversations
  set
    guest_history_cleared_at = now(),
    guest_last_read_at = now()
  where guest_id = old.user_id;

  return old;
end;
$$;

revoke all on function private.clear_guest_message_history_on_profile_delete() from public, anon, authenticated;

drop trigger if exists clear_guest_message_history_before_profile_delete on public.guest_profiles;
create trigger clear_guest_message_history_before_profile_delete
before delete on public.guest_profiles
for each row
execute function private.clear_guest_message_history_on_profile_delete();

drop policy if exists "Conversation participants can view messages" on public.property_messages;
create policy "Conversation participants can view messages"
on public.property_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.property_conversations
    where property_conversations.id = property_messages.conversation_id
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
