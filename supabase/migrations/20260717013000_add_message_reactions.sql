create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.property_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike', 'love')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index message_reactions_message_index
  on public.message_reactions (message_id, created_at);

alter table public.message_reactions enable row level security;

create policy "Conversation participants can view message reactions"
on public.message_reactions for select to authenticated
using (
  exists (
    select 1 from public.property_messages as message
    join public.property_conversations as conversation on conversation.id = message.conversation_id
    where message.id = message_reactions.message_id
      and (conversation.guest_id = (select auth.uid()) or conversation.host_id = (select auth.uid()))
  )
);

create policy "Conversation participants can add their message reactions"
on public.message_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.property_messages as message
    join public.property_conversations as conversation on conversation.id = message.conversation_id
    where message.id = message_reactions.message_id
      and (conversation.guest_id = (select auth.uid()) or conversation.host_id = (select auth.uid()))
  )
);

create policy "Members can change their message reactions"
on public.message_reactions for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.property_messages as message
    join public.property_conversations as conversation on conversation.id = message.conversation_id
    where message.id = message_reactions.message_id
      and (conversation.guest_id = (select auth.uid()) or conversation.host_id = (select auth.uid()))
  )
)
with check (user_id = (select auth.uid()) and reaction in ('like', 'dislike', 'love'));

create policy "Members can remove their message reactions"
on public.message_reactions for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.property_messages as message
    join public.property_conversations as conversation on conversation.id = message.conversation_id
    where message.id = message_reactions.message_id
      and (conversation.guest_id = (select auth.uid()) or conversation.host_id = (select auth.uid()))
  )
);

revoke all on table public.message_reactions from anon;
grant select, insert, update, delete on table public.message_reactions to authenticated;
grant all on table public.message_reactions to service_role;
