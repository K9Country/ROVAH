create or replace function public.send_property_reservation_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  reservation_host_id uuid;
  conversation_id uuid;
  created_message_id uuid;
  claimed_booking_id uuid;
  configured_message text;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  select host_id into reservation_host_id
  from public.properties
  where id = new.property_id;
  if reservation_host_id is null then return new; end if;

  select message_text into configured_message
  from public.property_reservation_welcome_messages
  where property_id = new.property_id
    and is_enabled = true
    and message_text is not null
    and char_length(btrim(message_text)) > 0;
  if configured_message is null then return new; end if;

  insert into public.booking_welcome_messages (booking_id, property_id, guest_id)
  values (new.id, new.property_id, new.guest_id)
  on conflict (booking_id) do nothing
  returning booking_id into claimed_booking_id;
  if claimed_booking_id is null then return new; end if;

  insert into public.property_conversations (property_id, guest_id, host_id)
  values (new.property_id, new.guest_id, reservation_host_id)
  on conflict (property_id, guest_id) do nothing;

  select id into conversation_id
  from public.property_conversations
  where property_id = new.property_id
    and guest_id = new.guest_id;
  if conversation_id is null then
    raise exception 'Could not create a guest conversation for reservation %', new.id;
  end if;

  insert into public.property_messages (conversation_id, sender_id, message_text)
  values (conversation_id, reservation_host_id, btrim(configured_message))
  returning id into created_message_id;

  update public.booking_welcome_messages
  set message_id = created_message_id
  where booking_id = new.id;

  perform net.http_post(
    url := 'https://yxxqazikrqweowtkeirr.supabase.co/functions/v1/notify-app-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automated-message-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'payout_runner_secret'
      )
    ),
    body := jsonb_build_object('type', 'message_created', 'resourceId', created_message_id)
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'payout_runner_secret');

  return new;
end;
$function$;
