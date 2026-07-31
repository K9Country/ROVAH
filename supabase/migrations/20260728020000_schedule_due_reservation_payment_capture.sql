-- Captures authorized reservation payments exactly at the one-hour cutoff.
-- The job remains dormant until the existing PAYOUT_RUNNER_SECRET is copied
-- into Supabase Vault as `payout_runner_secret`.

create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'capture-due-reservation-payments') then
    perform cron.unschedule('capture-due-reservation-payments');
  end if;

  perform cron.schedule(
    'capture-due-reservation-payments',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://yxxqazikrqweowtkeirr.supabase.co/functions/v1/capture-due-reservation-payments',
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
        select 1 from vault.decrypted_secrets where name = 'payout_runner_secret'
      );
    $job$
  );
end $$;
