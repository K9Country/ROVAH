-- A reservation alert is generated only once the reservation becomes
-- confirmed. The host can acknowledge it by opening that site's Reservations
-- screen; otherwise it stays unread across future sessions.
create table if not exists public.host_reservation_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (booking_id)
);

create index if not exists host_reservation_notifications_host_unread_index
  on public.host_reservation_notifications (host_id, property_id, created_at desc)
  where read_at is null;

alter table public.host_reservation_notifications enable row level security;
revoke all on table public.host_reservation_notifications from anon;
grant select, update on table public.host_reservation_notifications to authenticated;
grant all on table public.host_reservation_notifications to service_role;

create policy "Hosts can view their own reservation alerts"
on public.host_reservation_notifications for select to authenticated
using (
  (select auth.uid()) = host_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "Hosts can acknowledge their own reservation alerts"
on public.host_reservation_notifications for update to authenticated
using (
  (select auth.uid()) = host_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
with check (
  (select auth.uid()) = host_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create or replace function public.create_host_reservation_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_host_id uuid;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  select host_id into reservation_host_id
  from public.properties
  where id = new.property_id;

  if reservation_host_id is not null then
    insert into public.host_reservation_notifications (booking_id, host_id, property_id)
    values (new.id, reservation_host_id, new.property_id)
    on conflict (booking_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.create_host_reservation_notification() from public, anon, authenticated;

drop trigger if exists create_host_reservation_notification_on_confirmation on public.bookings;
create trigger create_host_reservation_notification_on_confirmation
after insert or update of status on public.bookings
for each row
when (new.status = 'confirmed')
execute function public.create_host_reservation_notification();
