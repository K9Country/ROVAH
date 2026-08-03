-- Voluntary SMS consent is kept separately from private profile data so the
-- application can retain an auditable consent and opt-out history.
create table if not exists public.sms_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sms_updates boolean not null default false,
  consented_at timestamptz,
  consent_version text,
  consent_source text check (consent_source in ('profile', 'settings')),
  consented_phone text,
  opted_out_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (sms_updates = false)
    or (consented_at is not null and consent_version is not null and consented_phone is not null and opted_out_at is null)
  )
);

alter table public.sms_notification_preferences enable row level security;

drop policy if exists "Users can read their own SMS preference" on public.sms_notification_preferences;
create policy "Users can read their own SMS preference"
on public.sms_notification_preferences for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.sms_notification_preferences from anon;
revoke insert, update, delete on public.sms_notification_preferences from authenticated;
grant select on public.sms_notification_preferences to authenticated;

create or replace function public.set_sms_notification_preference(
  p_enabled boolean,
  p_phone text,
  p_source text
)
returns public.sms_notification_preferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  preference public.sms_notification_preferences;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_source not in ('profile', 'settings') then
    raise exception 'Invalid consent source.';
  end if;

  if p_enabled and nullif(trim(p_phone), '') is null then
    raise exception 'A phone number is required for SMS consent.';
  end if;

  insert into public.sms_notification_preferences (
    user_id,
    sms_updates,
    consented_at,
    consent_version,
    consent_source,
    consented_phone,
    opted_out_at,
    updated_at
  )
  values (
    current_user_id,
    p_enabled,
    case when p_enabled then now() else null end,
    case when p_enabled then '2026-08-03' else null end,
    case when p_enabled then p_source else null end,
    case when p_enabled then trim(p_phone) else null end,
    case when p_enabled then null else now() end,
    now()
  )
  on conflict (user_id) do update
  set
    sms_updates = excluded.sms_updates,
    consented_at = case when excluded.sms_updates then now() else public.sms_notification_preferences.consented_at end,
    consent_version = case when excluded.sms_updates then excluded.consent_version else public.sms_notification_preferences.consent_version end,
    consent_source = case when excluded.sms_updates then excluded.consent_source else public.sms_notification_preferences.consent_source end,
    consented_phone = case when excluded.sms_updates then excluded.consented_phone else public.sms_notification_preferences.consented_phone end,
    opted_out_at = case when excluded.sms_updates then null else now() end,
    updated_at = now()
  returning * into preference;

  return preference;
end;
$$;

revoke all on function public.set_sms_notification_preference(boolean, text, text) from public;
grant execute on function public.set_sms_notification_preference(boolean, text, text) to authenticated;
