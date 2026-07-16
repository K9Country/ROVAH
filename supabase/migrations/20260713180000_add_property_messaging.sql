-- One guest-to-host conversation per property, with messages kept private to
-- the guest and the host of that specific property.
create table public.property_conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (property_id, guest_id)
);

create index property_conversations_guest_index
  on public.property_conversations (guest_id, created_at desc);

create index property_conversations_host_index
  on public.property_conversations (host_id, created_at desc);

alter table public.property_conversations enable row level security;

create policy "Conversation participants can view their conversations"
on public.property_conversations
for select
to authenticated
using (
  guest_id = (select auth.uid())
  or host_id = (select auth.uid())
);

create policy "Guests can start a conversation about a published property"
on public.property_conversations
for insert
to authenticated
with check (
  guest_id = (select auth.uid())
  and exists (
    select 1
    from public.properties
    where properties.id = property_conversations.property_id
      and properties.host_id = property_conversations.host_id
      and properties.is_published = true
  )
);

create table public.property_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.property_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message_text text not null check (char_length(trim(message_text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index property_messages_conversation_created_index
  on public.property_messages (conversation_id, created_at);

alter table public.property_messages enable row level security;

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
        property_conversations.guest_id = (select auth.uid())
        or property_conversations.host_id = (select auth.uid())
      )
  )
);

create policy "Conversation participants can send messages"
on public.property_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.property_conversations
    where property_conversations.id = property_messages.conversation_id
      and (
        property_conversations.guest_id = (select auth.uid())
        or property_conversations.host_id = (select auth.uid())
      )
  )
);

revoke all on table public.property_conversations from anon;
revoke all on table public.property_messages from anon;
grant select, insert on table public.property_conversations to authenticated;
grant select, insert on table public.property_messages to authenticated;
grant all on table public.property_conversations to service_role;
grant all on table public.property_messages to service_role;
