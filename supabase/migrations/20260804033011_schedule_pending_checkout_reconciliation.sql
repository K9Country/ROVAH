-- Stripe webhooks and the browser return are both fast paths. This recurring
-- reconciliation makes completed Checkout sessions durable if either callback
-- is interrupted by an in-app browser or network transition.
do $block$
begin
  if exists (select 1 from cron.job where jobname = 'reconcile-pending-booking-checkouts') then
    perform cron.unschedule('reconcile-pending-booking-checkouts');
  end if;

  perform cron.schedule(
    'reconcile-pending-booking-checkouts',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://yxxqazikrqweowtkeirr.supabase.co/functions/v1/reconcile-pending-booking-checkouts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-payment-capture-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'payout_runner_secret'
          )
        ),
        body := jsonb_build_object('scheduled_at', now())
      )
      where exists (
        select 1
        from vault.decrypted_secrets
        where name = 'payout_runner_secret'
      );
    $job$
  );
end;
$block$;
