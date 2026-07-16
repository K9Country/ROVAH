-- A listing's exact location is supplied by its host and powers the
-- guest-facing Google Maps destination for that specific site.
alter table public.properties
  add column if not exists site_address text not null default '';
