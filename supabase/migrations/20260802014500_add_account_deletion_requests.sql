create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  confirmation_token uuid not null unique default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'pending_review', 'completed', 'declined'))
);
alter table public.account_deletion_requests enable row level security;
create index if not exists account_deletion_requests_email_idx on public.account_deletion_requests (lower(email));
