-- A Stripe Checkout session may be abandoned before a card is entered. The
-- matching reservation is only a short checkout hold and must never become a
-- visible or chargeable reservation without a completed Stripe flow.

create or replace function public.release_expired_payment_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  released_count integer;
begin
  update public.bookings
  set
    status = 'cancelled',
    payment_status = 'cancelled',
    payment_released_at = now(),
    payment_updated_at = now()
  where status = 'payment_pending'
    and payment_status = 'processing'
    and payment_hold_expires_at is not null
    and payment_hold_expires_at <= now();

  get diagnostics released_count = row_count;
  return released_count;
end;
$function$;

revoke all on function public.release_expired_payment_holds() from public, anon, authenticated;

do $block$
begin
  if exists (select 1 from cron.job where jobname = 'release-expired-payment-holds') then
    perform cron.unschedule('release-expired-payment-holds');
  end if;

  perform cron.schedule(
    'release-expired-payment-holds',
    '* * * * *',
    'select public.release_expired_payment_holds();'
  );
end;
$block$;
