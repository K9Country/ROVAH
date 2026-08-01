-- Hosts can read aggregate subscription credit data for their own sites.
drop policy if exists "Hosts can view loyalty passes for their properties" on public.member_loyalty_passes;

create policy "Hosts can view loyalty passes for their properties"
on public.member_loyalty_passes for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = member_loyalty_passes.property_id
      and properties.host_id = (select auth.uid())
  )
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);
