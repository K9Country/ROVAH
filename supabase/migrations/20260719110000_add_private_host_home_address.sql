alter table public.host_profiles
  add column if not exists home_address text,
  add column if not exists home_city text,
  add column if not exists home_state text,
  add column if not exists home_postal_code text;
