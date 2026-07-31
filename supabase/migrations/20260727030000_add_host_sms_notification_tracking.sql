-- A confirmed reservation should create one transactional host text, even if
-- the member revisits the success page or the app retries the confirmation.
alter table public.bookings
  add column if not exists host_sms_notified_at timestamptz,
  add column if not exists host_sms_notification_claimed_at timestamptz;
