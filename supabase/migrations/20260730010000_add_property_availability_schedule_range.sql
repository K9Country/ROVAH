alter table public.property_availability
  add column if not exists starts_on date,
  add column if not exists ends_on date;

comment on column public.property_availability.starts_on is
  'Optional first date when this weekly availability schedule applies.';

comment on column public.property_availability.ends_on is
  'Optional final date when this weekly availability schedule applies.';
