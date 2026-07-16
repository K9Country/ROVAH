-- Stripe payment readiness
-- This migration records payment state without collecting or storing card data.
-- Stripe credentials and PaymentIntent identifiers will only be handled later by
-- a server-side integration (for example, a Supabase Edge Function).

alter table public.bookings
  add column if not exists payment_status text not null default 'pending_configuration'
    check (payment_status in ('pending_configuration', 'processing', 'paid', 'refunded', 'failed', 'cancelled')),
  add column if not exists payment_provider text,
  add column if not exists payment_updated_at timestamptz not null default now();

alter table public.host_profiles
  add column if not exists payout_status text not null default 'not_connected'
    check (payout_status in ('not_connected', 'pending', 'active', 'restricted'));

-- Members must not be able to submit their own amount, booking status, or
-- payment state. The existing booking trigger computes the amount on the server.
revoke insert on table public.bookings from authenticated;
grant insert (property_id, guest_id, start_at, end_at, dog_count)
  on table public.bookings to authenticated;

create or replace function public.sync_booking_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status = 'confirmed'
    and old.payment_status = 'pending_configuration' then
    new.payment_status := 'cancelled';
    new.payment_updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.sync_booking_payment_status() from public, anon, authenticated;

drop trigger if exists sync_booking_payment_status_before_update on public.bookings;

create trigger sync_booking_payment_status_before_update
before update on public.bookings
for each row
execute function public.sync_booking_payment_status();
