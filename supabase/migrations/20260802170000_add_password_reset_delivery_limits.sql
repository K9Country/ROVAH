create table if not exists public.password_reset_delivery_limits (
  request_key text primary key,
  requested_at timestamptz not null default now()
);

alter table public.password_reset_delivery_limits enable row level security;

revoke all on table public.password_reset_delivery_limits from anon, authenticated;

