-- Hosts can save one optional welcome message for each site.  A configured
-- message is inserted only once, immediately when a reservation is confirmed.
create table public.property_reservation_welcome_messages (
  property_id uuid primary key references public.properties(id) on delete cascade,
  is_enabled boolean not null default false,
  message_text text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_reservation_welcome_messages_text_check check (
    (is_enabled = false)
    or (message_text is not null and char_length(btrim(message_text)) between 1 and 2000)
  )
);

create table public.booking_welcome_messages (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid unique references public.property_messages(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index property_reservation_welcome_messages_property_index
  on public.property_reservation_welcome_messages (property_id);

alter table public.property_reservation_welcome_messages enable row level security;
alter table public.booking_welcome_messages enable row level security;

revoke all on table public.property_reservation_welcome_messages from anon;
revoke all on table public.booking_welcome_messages from anon, authenticated;
grant select, insert, update on table public.property_reservation_welcome_messages to authenticated;
grant all on table public.property_reservation_welcome_messages, public.booking_welcome_messages to service_role;

create policy "Hosts manage their site welcome message"
on public.property_reservation_welcome_messages for all to authenticated
using (
  exists (
    select 1 from public.properties
    where properties.id = property_reservation_welcome_messages.property_id
      and properties.host_id = (select auth.uid())
  )
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
with check (
  exists (
    select 1 from public.properties
    where properties.id = property_reservation_welcome_messages.property_id
      and properties.host_id = (select auth.uid())
  )
  and updated_by = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create or replace function public.set_property_reservation_welcome_message_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_property_reservation_welcome_message_updated_at() from public, anon, authenticated;
grant execute on function public.set_property_reservation_welcome_message_updated_at() to service_role;

create trigger set_property_reservation_welcome_message_updated_at
before update on public.property_reservation_welcome_messages
for each row execute function public.set_property_reservation_welcome_message_updated_at();

-- This database trigger covers every confirmation path: subscription visits,
-- Stripe reservations, and future admin or automation confirmations.  The
-- booking_welcome_messages primary key makes the operation idempotent.
create or replace function public.send_property_reservation_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  if reservation_host_id is null then
    return new;
  end if;

  select message_text into configured_message
  from public.property_reservation_welcome_messages
  where property_id = new.property_id
    and is_enabled = true
    and message_text is not null
    and char_length(btrim(message_text)) > 0;

  if configured_message is null then
    return new;
  end if;

  insert into public.booking_welcome_messages (booking_id, property_id, guest_id)
  values (new.id, new.property_id, new.guest_id)
  on conflict (booking_id) do nothing
  returning booking_id into claimed_booking_id;

  if claimed_booking_id is null then
    return new;
  end if;

  insert into public.property_conversations (property_id, guest_id, host_id)
  values (new.property_id, new.guest_id, reservation_host_id)
  on conflict (host_id, guest_id) do nothing;

  select id into conversation_id
  from public.property_conversations
  where host_id = reservation_host_id
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

  -- Email is sent asynchronously. The secret is read only inside Vault and is
  -- never exposed to the app; a transient notification failure cannot undo a
  -- confirmed reservation or its in-app message.
  perform net.http_post(
    url := 'https://yxxqazikrqweowtkeirr.supabase.co/functions/v1/notify-app-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-automated-message-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'payout_runner_secret'
      )
    ),
    body := jsonb_build_object('type', 'message_created', 'resourceId', created_message_id)
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'payout_runner_secret');

  return new;
end;
$$;

revoke all on function public.send_property_reservation_welcome_message() from public, anon, authenticated;

create trigger send_property_reservation_welcome_message_on_confirmation
after insert or update of status on public.bookings
for each row
when (new.status = 'confirmed')
execute function public.send_property_reservation_welcome_message();
