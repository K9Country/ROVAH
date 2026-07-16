-- Keep one conversation for each guest and host pair, independent of the
-- property where the conversation began. Existing messages are moved to the
-- oldest conversation in each pair before duplicate threads are removed.
with ranked_conversations as (
  select
    id,
    first_value(id) over (
      partition by guest_id, host_id
      order by created_at, id
    ) as canonical_id
  from public.property_conversations
), duplicate_conversations as (
  select id, canonical_id
  from ranked_conversations
  where id <> canonical_id
)
update public.property_messages as message
set conversation_id = duplicate_conversations.canonical_id
from duplicate_conversations
where message.conversation_id = duplicate_conversations.id;

with ranked_conversations as (
  select
    id,
    first_value(id) over (
      partition by guest_id, host_id
      order by created_at, id
    ) as canonical_id,
    guest_last_read_at,
    host_last_read_at
  from public.property_conversations
), read_state as (
  select
    canonical_id,
    max(guest_last_read_at) as guest_last_read_at,
    max(host_last_read_at) as host_last_read_at
  from ranked_conversations
  group by canonical_id
)
update public.property_conversations as conversation
set
  guest_last_read_at = read_state.guest_last_read_at,
  host_last_read_at = read_state.host_last_read_at
from read_state
where conversation.id = read_state.canonical_id;

with ranked_conversations as (
  select
    id,
    first_value(id) over (
      partition by guest_id, host_id
      order by created_at, id
    ) as canonical_id
  from public.property_conversations
)
delete from public.property_conversations as conversation
using ranked_conversations
where conversation.id = ranked_conversations.id
  and ranked_conversations.id <> ranked_conversations.canonical_id;

alter table public.property_conversations
  drop constraint property_conversations_property_id_guest_id_key,
  add constraint property_conversations_host_id_guest_id_key unique (host_id, guest_id);

create index if not exists property_conversations_host_guest_index
  on public.property_conversations (host_id, guest_id);
