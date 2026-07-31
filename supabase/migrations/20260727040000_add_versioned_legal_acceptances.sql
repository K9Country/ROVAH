-- Versioned, append-only legal acceptance records. These records are kept
-- separately from editable profile data so a member's acceptance history is
-- available for legal recordkeeping.
create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null check (document_key in ('terms_of_service', 'liability_waiver_release')),
  document_title text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  acceptance_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, document_key, document_version)
);

create index if not exists user_legal_acceptances_user_accepted_at_idx
  on public.user_legal_acceptances (user_id, accepted_at desc);

alter table public.user_legal_acceptances enable row level security;
alter table public.user_legal_acceptances force row level security;

revoke all on table public.user_legal_acceptances from anon;
revoke all on table public.user_legal_acceptances from authenticated;
grant select on table public.user_legal_acceptances to authenticated;
grant all on table public.user_legal_acceptances to service_role;

drop policy if exists "Users can read their own legal acceptance history" on public.user_legal_acceptances;
create policy "Users can read their own legal acceptance history"
on public.user_legal_acceptances
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Email account creation supplies a signed-in user's click acknowledgements as
-- auth metadata. This trigger retains the server timestamp and immutable
-- document/version identifiers even when email confirmation delays the first
-- application session.
create or replace function private.capture_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  acceptance jsonb := coalesce(new.raw_user_meta_data -> 'legal_acceptance', '{}'::jsonb);
  is_valid boolean;
begin
  is_valid :=
    coalesce(acceptance ->> 'terms_accepted', 'false') = 'true'
    and coalesce(acceptance ->> 'waiver_acknowledged', 'false') = 'true'
    and coalesce(acceptance ->> 'adult_certified', 'false') = 'true'
    and coalesce(acceptance ->> 'release_acknowledged', 'false') = 'true'
    and coalesce(acceptance ->> 'terms_version', '') = '2026-07-27'
    and coalesce(acceptance ->> 'waiver_version', '') = '2026-07-27';

  -- The ROVAH account-creation flow must provide all four acknowledgements.
  -- OAuth providers are excluded because they are not currently part of this
  -- email/password registration flow and need their own acceptance handoff.
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email' and not is_valid then
    raise exception 'Current ROVAH Terms and Liability Waiver acceptance is required to create an account.';
  end if;

  if is_valid then
    insert into public.user_legal_acceptances (
      user_id, document_key, document_title, document_version, user_agent, acceptance_context
    ) values
      (
        new.id,
        'terms_of_service',
        'ROVAH Terms of Service',
        acceptance ->> 'terms_version',
        nullif(left(coalesce(acceptance ->> 'client_user_agent', ''), 1000), ''),
        jsonb_build_object(
          'source', 'account_creation',
          'client_accepted_at', acceptance ->> 'client_accepted_at',
          'client_platform', acceptance ->> 'client_platform',
          'adult_certified', true,
          'release_acknowledged', true
        )
      ),
      (
        new.id,
        'liability_waiver_release',
        'ROVAH Guest Liability Waiver and Release',
        acceptance ->> 'waiver_version',
        nullif(left(coalesce(acceptance ->> 'client_user_agent', ''), 1000), ''),
        jsonb_build_object(
          'source', 'account_creation',
          'client_accepted_at', acceptance ->> 'client_accepted_at',
          'client_platform', acceptance ->> 'client_platform',
          'adult_certified', true,
          'release_acknowledged', true
        )
      )
    on conflict (user_id, document_key, document_version) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists capture_signup_legal_acceptance on auth.users;
create trigger capture_signup_legal_acceptance
after insert on auth.users
for each row execute function private.capture_signup_legal_acceptance();
