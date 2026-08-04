-- Keep gateway JWT verification enabled. The recurring job supplies the
-- project's public API authorization from Vault, plus the separate private
-- scheduler secret validated by the function itself.
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
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'supabase_scheduler_authorization'
          ),
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'supabase_scheduler_authorization'
          ),
          'x-payment-capture-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'payout_runner_secret'
          )
        ),
        body := jsonb_build_object('scheduled_at', now())
      )
      where (
        select count(*)
        from vault.decrypted_secrets
        where name in ('payout_runner_secret', 'supabase_scheduler_authorization')
      ) = 2;
    $job$
  );
end;
$block$;
