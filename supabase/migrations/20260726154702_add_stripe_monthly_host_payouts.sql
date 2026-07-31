-- Stripe Connect monthly host payouts.
-- Paid reservations are held by ROVAH and included in one host transfer per month.

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
    check (status in ('payment_pending', 'confirmed', 'cancelled')),
  alter column status set default 'payment_pending',
  add column if not exists payment_hold_expires_at timestamptz,
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id text unique,
  add column if not exists stripe_transfer_id text;

alter table public.bookings
  drop constraint if exists bookings_no_overlapping_confirmed_reservations;

alter table public.bookings
  add constraint bookings_no_overlapping_active_reservations
  exclude using gist (
    property_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status in ('payment_pending', 'confirmed'));

create index if not exists bookings_monthly_payout_index
  on public.bookings (property_id, end_at)
  where status = 'confirmed' and payment_status = 'paid';

alter table public.host_profiles
  add column if not exists stripe_connected_account_id text unique;

create table if not exists public.host_payouts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  payout_month date not null,
  gross_amount numeric(10, 2) not null check (gross_amount >= 0),
  platform_fee_amount numeric(10, 2) not null check (platform_fee_amount >= 0),
  payout_amount numeric(10, 2) not null check (payout_amount >= 0),
  stripe_transfer_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'reversed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (host_id, payout_month)
);

alter table public.host_payouts enable row level security;

create policy "Hosts can view their own payouts"
on public.host_payouts
for select
to authenticated
using ((select auth.uid()) = host_id);

revoke all on public.host_payouts from anon;
grant select on public.host_payouts to authenticated;

-- Do not allow a payment hold to be created for a visit that has already started.
create or replace function public.prevent_past_reservation_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('payment_pending', 'confirmed') and new.start_at <= now() then
    raise exception 'Reservation start time must be in the future'
      using errcode = '22023';
  end if;

  return new;
end;
$$;
