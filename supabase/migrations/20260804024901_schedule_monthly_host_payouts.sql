-- Consolidate every eligible property belonging to a host into a single payout
-- on the eighth of each month. 14:00 UTC is always the eighth in US Eastern
-- time (09:00 EST / 10:00 EDT), while the payout function itself uses UTC
-- month boundaries consistently with its settlement records.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'run-monthly-host-payouts') then
    perform cron.unschedule('run-monthly-host-payouts');
  end if;

  perform cron.schedule(
    'run-monthly-host-payouts',
    '0 14 8 * *',
    $job$
      select net.http_post(
        url := 'https://yxxqazikrqweowtkeirr.supabase.co/functions/v1/run-monthly-host-payouts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-payout-runner-secret', (
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
end $$;
