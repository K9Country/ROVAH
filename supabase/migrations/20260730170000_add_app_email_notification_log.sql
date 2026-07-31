-- Delivery log used only by the server-side notification function.  The
-- unique key makes retries safe and prevents duplicate emails for one event.
create table if not exists public.app_email_notifications (
  event_type text not null,
  resource_id uuid not null,
  recipient_email text not null,
  sent_at timestamptz not null default now(),
  primary key (event_type, resource_id, recipient_email)
);

alter table public.app_email_notifications enable row level security;

revoke all on table public.app_email_notifications from anon, authenticated;
grant select, insert, update, delete on table public.app_email_notifications to service_role;
