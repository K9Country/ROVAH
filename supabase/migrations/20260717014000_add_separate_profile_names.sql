-- Store personal names separately while keeping full_name for existing
-- reservation, review, and messaging displays.

alter table public.guest_profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '';

alter table public.host_profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '';

update public.guest_profiles
set
  first_name = case
    when trim(first_name) <> '' then trim(first_name)
    else split_part(trim(full_name), ' ', 1)
  end,
  last_name = case
    when trim(last_name) <> '' then trim(last_name)
    else coalesce(nullif(trim(regexp_replace(trim(full_name), '^\\S+\\s*', '')), ''), '')
  end
where trim(first_name) = '' or trim(last_name) = '';

update public.host_profiles
set
  first_name = case
    when trim(first_name) <> '' then trim(first_name)
    else split_part(trim(full_name), ' ', 1)
  end,
  last_name = case
    when trim(last_name) <> '' then trim(last_name)
    else coalesce(nullif(trim(regexp_replace(trim(full_name), '^\\S+\\s*', '')), ''), '')
  end
where trim(first_name) = '' or trim(last_name) = '';

grant insert (first_name, last_name) on table public.host_profiles to authenticated;
grant update (first_name, last_name) on table public.host_profiles to authenticated;
