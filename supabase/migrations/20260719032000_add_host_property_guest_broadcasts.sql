-- Hosts may send a property-related in-app message to the confirmed visitors
-- of one of their own properties. The function is intentionally atomic so a
-- host never sees a partial broadcast.
create or replace function public.send_property_guest_broadcast(
  p_property_id uuid,
  p_audience text,
  p_message text
)
returns table(recipient_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  calling_host_id uuid := (select auth.uid());
  recipient_ids uuid[];
  clean_message text := trim(p_message);
begin
  if calling_host_id is null then
    raise exception 'Sign in as a host to send a guest message';
  end if;

  if p_audience not in ('all', 'upcoming', 'past') then
    raise exception 'Choose a valid guest audience';
  end if;

  if char_length(clean_message) < 1 or char_length(clean_message) > 2000 then
    raise exception 'Messages must be between 1 and 2,000 characters';
  end if;

  if not exists (
    select 1
    from public.properties
    where properties.id = p_property_id
      and properties.host_id = calling_host_id
  ) then
    raise exception 'You can only message visitors of your own property';
  end if;

  select array_agg(distinct bookings.guest_id)
  into recipient_ids
  from public.bookings
  where bookings.property_id = p_property_id
    and bookings.status = 'confirmed'
    and (
      p_audience = 'all'
      or (p_audience = 'upcoming' and bookings.end_at > now())
      or (p_audience = 'past' and bookings.end_at <= now())
    );

  if coalesce(cardinality(recipient_ids), 0) = 0 then
    return query select 0;
    return;
  end if;

  insert into public.property_conversations (property_id, guest_id, host_id)
  select p_property_id, recipient_id, calling_host_id
  from unnest(recipient_ids) as recipient_id
  on conflict (property_id, guest_id) do nothing;

  insert into public.property_messages (conversation_id, sender_id, message_text)
  select conversations.id, calling_host_id, clean_message
  from public.property_conversations as conversations
  where conversations.property_id = p_property_id
    and conversations.host_id = calling_host_id
    and conversations.guest_id = any(recipient_ids);

  return query select cardinality(recipient_ids);
end;
$$;

revoke all on function public.send_property_guest_broadcast(uuid, text, text) from public, anon;
grant execute on function public.send_property_guest_broadcast(uuid, text, text) to authenticated;
