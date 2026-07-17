-- Stripe Identity status is server-controlled. Hosts can read their own
-- status, but cannot mark themselves as verified from the client app.
alter table public.host_profiles
  add column if not exists identity_verification_status text not null default 'not_started',
  add column if not exists identity_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'host_profiles_identity_verification_status_check'
  ) then
    alter table public.host_profiles
      add constraint host_profiles_identity_verification_status_check
      check (identity_verification_status in (
        'not_started',
        'requires_input',
        'processing',
        'verified',
        'canceled'
      ));
  end if;
end;
$$;

-- Deliberately do not grant authenticated users INSERT or UPDATE access to
-- these columns. A future server-side Stripe webhook will be the only writer.
