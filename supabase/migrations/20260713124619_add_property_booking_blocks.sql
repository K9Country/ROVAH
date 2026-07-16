-- Publicly readable availability blocks contain no guest or payment data.
-- They let a member see which times are unavailable before attempting a booking.

create table public.property_booking_blocks (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index property_booking_blocks_property_start_index
  on public.property_booking_blocks (property_id, start_at);

alter table public.property_booking_blocks enable row level security;

create policy "Members can view unavailable times for published properties"
on public.property_booking_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_booking_blocks.property_id
      and properties.is_published = true
  )
);

revoke all on table public.property_booking_blocks from anon, authenticated;
grant select on table public.property_booking_blocks to authenticated;

create or replace function public.sync_property_booking_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.property_booking_blocks
    where booking_id = old.id;
    return old;
  end if;

  delete from public.property_booking_blocks
  where booking_id = new.id;

  if new.status = 'confirmed' then
    insert into public.property_booking_blocks (
      booking_id,
      property_id,
      start_at,
      end_at
    )
    values (
      new.id,
      new.property_id,
      new.start_at,
      new.end_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_property_booking_block() from public, anon, authenticated;

drop trigger if exists sync_property_booking_block_after_change on public.bookings;
create trigger sync_property_booking_block_after_change
after insert or update or delete on public.bookings
for each row
execute function public.sync_property_booking_block();

-- Backfill time blocks for any reservations made before this migration.
insert into public.property_booking_blocks (
  booking_id,
  property_id,
  start_at,
  end_at
)
select
  bookings.id,
  bookings.property_id,
  bookings.start_at,
  bookings.end_at
from public.bookings
where bookings.status = 'confirmed'
on conflict (booking_id) do update
set
  property_id = excluded.property_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at;
