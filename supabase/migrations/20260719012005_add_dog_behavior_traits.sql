alter table public.dog_profiles
  add column if not exists behavior_traits text[] not null default '{}';
