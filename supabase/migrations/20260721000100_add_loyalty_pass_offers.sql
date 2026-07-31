create table if not exists public.loyalty_pass_offers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 80),
  credit_count integer not null check (credit_count between 1 and 50),
  package_price numeric(10, 2) not null check (package_price > 0),
  duration_months smallint not null check (duration_months between 1 and 12),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_pass_offers_property_id_idx
  on public.loyalty_pass_offers(property_id);

alter table public.loyalty_pass_offers enable row level security;

drop policy if exists "Active loyalty passes are visible on published properties" on public.loyalty_pass_offers;
drop policy if exists "Hosts can manage loyalty passes for their properties" on public.loyalty_pass_offers;

create policy "Active loyalty passes are visible on published properties"
on public.loyalty_pass_offers for select
to public
using (
  is_active = true
  and exists (
    select 1
    from public.properties
    where properties.id = loyalty_pass_offers.property_id
      and properties.is_published = true
  )
);

create policy "Hosts can manage loyalty passes for their properties"
on public.loyalty_pass_offers for all
to authenticated
using (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.properties
    where properties.id = loyalty_pass_offers.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  and exists (
    select 1
    from public.properties
    where properties.id = loyalty_pass_offers.property_id
      and properties.host_id = (select auth.uid())
  )
);
