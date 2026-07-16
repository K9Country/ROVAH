-- Keep a listing visible while letting a host stop new reservations temporarily.
alter table public.properties
  add column if not exists is_temporarily_closed boolean not null default false;
