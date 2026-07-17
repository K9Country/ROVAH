-- Keep the first site location with the host application so it can prefill
-- the first property draft. Each property retains its own address thereafter.
alter table public.host_profiles
  add column if not exists primary_site_address text,
  add column if not exists primary_site_city text,
  add column if not exists primary_site_state text,
  add column if not exists primary_site_postal_code text;

grant insert (
  primary_site_address,
  primary_site_city,
  primary_site_state,
  primary_site_postal_code
) on table public.host_profiles to authenticated;

grant update (
  primary_site_address,
  primary_site_city,
  primary_site_state,
  primary_site_postal_code
) on table public.host_profiles to authenticated;
