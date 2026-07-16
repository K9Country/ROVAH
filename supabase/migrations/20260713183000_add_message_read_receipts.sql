-- Track read state separately for the guest and host in each conversation.
-- A message is unread only for the participant who did not send it and has
-- not opened the conversation since that message was created.
alter table public.property_conversations
  add column if not exists guest_last_read_at timestamptz not null default now(),
  add column if not exists host_last_read_at timestamptz not null default now();

create index if not exists property_conversations_guest_read_index
  on public.property_conversations (guest_id, guest_last_read_at);

create index if not exists property_conversations_host_read_index
  on public.property_conversations (host_id, host_last_read_at);

-- Keep this update narrowly scoped: app users can only mark their own side
-- of a conversation as read. They cannot edit participants or property data.
create or replace function public.mark_property_conversation_read(
  target_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.property_conversations
  set
    guest_last_read_at = case
      when guest_id = (select auth.uid()) then now()
      else guest_last_read_at
    end,
    host_last_read_at = case
      when host_id = (select auth.uid()) then now()
      else host_last_read_at
    end
  where id = target_conversation_id
    and (
      guest_id = (select auth.uid())
      or host_id = (select auth.uid())
    );
end;
$$;

revoke all on function public.mark_property_conversation_read(uuid) from public;
grant execute on function public.mark_property_conversation_read(uuid) to authenticated;
