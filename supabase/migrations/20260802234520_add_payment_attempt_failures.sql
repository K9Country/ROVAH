-- Private operational audit trail for failed checkout starts. This is not
-- exposed to members or hosts; it lets support identify a payment failure
-- without storing any card data.
create table public.payment_attempt_failures (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  guest_id uuid references auth.users(id) on delete set null,
  stage text not null,
  error_message text not null,
  created_at timestamptz not null default now()
);

alter table public.payment_attempt_failures enable row level security;
