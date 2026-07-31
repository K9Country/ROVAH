-- Hosts receive only the aggregate opportunity count for their own site.
-- Exact member identity and location data never leave the server.
create or replace function public.get_site_promotion_opportunity(p_property_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = p_property_id and host_id = (select auth.uid())
  ) then
    raise exception 'This site is not available for your host account';
  end if;

  return (select count(*)::integer from public.site_promotion_eligible_members(p_property_id));
end;
$$;

revoke all on function public.get_site_promotion_opportunity(uuid) from public, anon;
grant execute on function public.get_site_promotion_opportunity(uuid) to authenticated;
