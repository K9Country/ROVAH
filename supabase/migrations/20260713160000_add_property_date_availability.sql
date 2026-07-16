-- Date-specific availability overrides let a host open or close individual
-- calendar days without changing their recurring weekly schedule.

create table public.property_date_availability (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  availability_date date not null,
  is_open boolean not null,
  start_time time without time zone,
  end_time time without time zone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, availability_date),
  check (
    (is_open = false and start_time is null and end_time is null)
    or
    (is_open = true and start_time is not null and end_time is not null and start_time < end_time)
  )
);

create index property_date_availability_property_date_index
  on public.property_date_availability (property_id, availability_date);

alter table public.property_date_availability enable row level security;

create policy "Members can view date availability for published properties"
on public.property_date_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_date_availability.property_id
      and (
        properties.is_published = true
        or properties.host_id = (select auth.uid())
      )
  )
);

create policy "Hosts can add date availability for their properties"
on public.property_date_availability
for insert
to authenticated
with check (
  exists (
    select 1
    from public.properties
    where properties.id = property_date_availability.property_id
      and properties.host_id = (select auth.uid())
  )
);

create policy "Hosts can update date availability for their properties"
on public.property_date_availability
for update
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_date_availability.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.properties
    where properties.id = property_date_availability.property_id
      and properties.host_id = (select auth.uid())
  )
);

create policy "Hosts can delete date availability for their properties"
on public.property_date_availability
for delete
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_date_availability.property_id
      and properties.host_id = (select auth.uid())
  )
);

revoke all on table public.property_date_availability from anon;
grant select, insert, update, delete on table public.property_date_availability to authenticated;
grant all on table public.property_date_availability to service_role;

create trigger set_property_date_availability_updated_at
before update on public.property_date_availability
for each row
execute function public.set_updated_at();
