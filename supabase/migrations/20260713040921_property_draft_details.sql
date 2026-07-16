-- K9 Country property-draft setup
-- Run this migration in the connected Supabase project before testing the
-- Property Draft screen. Hosts can manage only records for their own property.

create extension if not exists pgcrypto;

-- A host must be able to reopen an unpublished draft they own. This policy is
-- intentionally separate from the public published-listings policy.
drop policy if exists "Hosts can view their own properties" on public.properties;

create policy "Hosts can view their own properties"
on public.properties
for select
to authenticated
using ((select auth.uid()) = host_id);

grant select, insert, update, delete on public.properties to authenticated;

create table if not exists public.property_draft_details (
  property_id uuid primary key references public.properties(id) on delete cascade,
  parking_instructions text not null default '',
  gate_access_instructions text not null default '',
  arrival_instructions text not null default '',
  property_rules text not null default '',
  availability_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_code text not null check (amenity_code in (
    'water',
    'shade',
    'picnic_table',
    'restroom',
    'parking',
    'tennis_ball',
    'frisbee',
    'agility_equipment',
    'cell_service',
    'wheelchair_accessible'
  )),
  created_at timestamptz not null default now(),
  primary key (property_id, amenity_code)
);

create table if not exists public.property_availability (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, day_of_week),
  check (start_time < end_time)
);

create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  display_order integer not null default 0 check (display_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists property_amenities_property_index
  on public.property_amenities (property_id);
create index if not exists property_availability_property_index
  on public.property_availability (property_id, day_of_week);
create index if not exists property_images_property_index
  on public.property_images (property_id, display_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_property_draft_details_updated_at on public.property_draft_details;
create trigger set_property_draft_details_updated_at
before update on public.property_draft_details
for each row execute function public.set_updated_at();

drop trigger if exists set_property_availability_updated_at on public.property_availability;
create trigger set_property_availability_updated_at
before update on public.property_availability
for each row execute function public.set_updated_at();

alter table public.property_draft_details enable row level security;
alter table public.property_amenities enable row level security;
alter table public.property_availability enable row level security;
alter table public.property_images enable row level security;

create policy "Hosts manage their own property draft details"
on public.property_draft_details
for all
to authenticated
using (
  exists (
    select 1 from public.properties
    where properties.id = property_draft_details.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.properties
    where properties.id = property_draft_details.property_id
      and properties.host_id = (select auth.uid())
  )
);

create policy "Hosts manage their own property amenities"
on public.property_amenities
for all
to authenticated
using (
  exists (
    select 1 from public.properties
    where properties.id = property_amenities.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.properties
    where properties.id = property_amenities.property_id
      and properties.host_id = (select auth.uid())
  )
);

create policy "Hosts manage their own property availability"
on public.property_availability
for all
to authenticated
using (
  exists (
    select 1 from public.properties
    where properties.id = property_availability.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.properties
    where properties.id = property_availability.property_id
      and properties.host_id = (select auth.uid())
  )
);

create policy "Hosts manage their own property images"
on public.property_images
for all
to authenticated
using (
  exists (
    select 1 from public.properties
    where properties.id = property_images.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.properties
    where properties.id = property_images.property_id
      and properties.host_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.property_draft_details to authenticated;
grant select, insert, update, delete on public.property_amenities to authenticated;
grant select, insert, update, delete on public.property_availability to authenticated;
grant select, insert, update, delete on public.property_images to authenticated;

insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', false)
on conflict (id) do update set public = false;

create policy "Hosts upload their own property images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Hosts view their own property images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Hosts delete their own property images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'property-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
