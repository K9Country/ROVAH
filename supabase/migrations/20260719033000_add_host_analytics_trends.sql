-- Store only the property and timestamp for future host click trends. No guest
-- identifier, location, or other browsing-history data is retained.
create table public.property_view_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index property_view_events_property_viewed_at_idx
  on public.property_view_events (property_id, viewed_at desc);

alter table public.property_view_events enable row level security;

create policy "Hosts can view click trends for their properties"
on public.property_view_events
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_view_events.property_id
      and properties.host_id = (select auth.uid())
  )
);

grant select on public.property_view_events to authenticated;

create or replace function private.record_property_view_internal(
  target_property_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_property_id uuid;
begin
  if (select auth.uid()) is null then
    return;
  end if;

  update public.properties
  set view_count = view_count + 1
  where id = target_property_id
    and is_published = true
    and host_id is distinct from (select auth.uid())
  returning id into recorded_property_id;

  if recorded_property_id is not null then
    insert into public.property_view_events (property_id)
    values (recorded_property_id);
  end if;
end;
$$;
