-- Financial settlement ledger for paid reservations.
-- Stripe is the source of truth for the processing fee.  The browser never
-- writes these values; only the verified Stripe webhook and protected payout
-- runner use them.

alter table public.bookings
  add column if not exists payment_hold_expires_at timestamptz,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_transfer_id text;

create unique index if not exists bookings_stripe_checkout_session_id_unique
  on public.bookings (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists bookings_stripe_payment_intent_id_unique
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('payment_pending', 'confirmed', 'completed', 'cancelled'));

alter table public.bookings drop constraint if exists bookings_no_overlapping_confirmed_reservations;
alter table public.bookings add constraint bookings_no_overlapping_active_reservations
  exclude using gist (
    property_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('payment_pending', 'confirmed'));

create table if not exists public.booking_payout_settlements (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  host_id uuid not null references auth.users(id) on delete restrict,
  reservation_total_amount numeric(10, 2) not null check (reservation_total_amount >= 0),
  rovah_service_fee_amount numeric(10, 2) not null check (rovah_service_fee_amount >= 0),
  stripe_processing_fee_amount numeric(10, 2) not null check (stripe_processing_fee_amount >= 0),
  host_payout_amount numeric(10, 2) not null check (host_payout_amount >= 0),
  currency text not null default 'usd' check (currency = lower(currency)),
  stripe_payment_intent_id text not null unique,
  stripe_charge_id text not null unique,
  stripe_balance_transaction_id text not null unique,
  settlement_status text not null default 'settled'
    check (settlement_status in ('settled', 'reversed', 'transfer_reversal_required')),
  stripe_transfer_id text,
  stripe_transfer_reversal_id text,
  reversal_reason text,
  finalized_at timestamptz not null default now(),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reservation_total_amount = rovah_service_fee_amount + stripe_processing_fee_amount + host_payout_amount)
);

create index if not exists booking_payout_settlements_host_status_index
  on public.booking_payout_settlements (host_id, settlement_status, finalized_at desc);

create index if not exists booking_payout_settlements_transfer_index
  on public.booking_payout_settlements (stripe_transfer_id)
  where stripe_transfer_id is not null;

alter table public.booking_payout_settlements enable row level security;

drop policy if exists "Hosts can view their own booking payout settlements" on public.booking_payout_settlements;
create policy "Hosts can view their own booking payout settlements"
on public.booking_payout_settlements
for select
to authenticated
using ((select auth.uid()) = host_id);

revoke all on public.booking_payout_settlements from anon, authenticated;
grant select on public.booking_payout_settlements to authenticated;

create table if not exists public.host_payouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete restrict,
  payout_month date not null,
  gross_amount numeric(10, 2) not null check (gross_amount >= 0),
  platform_fee_amount numeric(10, 2) not null check (platform_fee_amount >= 0),
  stripe_processing_fee_amount numeric(10, 2) not null check (stripe_processing_fee_amount >= 0),
  payout_amount numeric(10, 2) not null check (payout_amount >= 0),
  stripe_transfer_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'reversed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (host_id, payout_month)
);

alter table public.host_payouts
  add column if not exists stripe_processing_fee_amount numeric(10, 2) not null default 0
    check (stripe_processing_fee_amount >= 0);

alter table public.host_payouts enable row level security;

drop policy if exists "Hosts can view their own payouts" on public.host_payouts;
create policy "Hosts can view their own payouts"
on public.host_payouts
for select
to authenticated
using ((select auth.uid()) = host_id);

revoke all on public.host_payouts from anon, authenticated;
grant select on public.host_payouts to authenticated;

alter table public.host_profiles
  add column if not exists stripe_connected_account_id text;

create unique index if not exists host_profiles_stripe_connected_account_id_unique
  on public.host_profiles (stripe_connected_account_id)
  where stripe_connected_account_id is not null;
