-- Member-controlled safety tools and communication preferences. These records
-- are private to the reporting/blocking member and can be reviewed by K9
-- Country staff through the project database.

create table if not exists public.member_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  category text not null check (category in ('safety', 'conduct', 'listing', 'review', 'message', 'other')),
  details text not null check (char_length(trim(details)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists member_reports_reporter_created_index
  on public.member_reports (reporter_id, created_at desc);

alter table public.member_reports enable row level security;

create policy "Members can file their own reports"
on public.member_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can view their own reports"
on public.member_reports for select to authenticated
using (reporter_id = (select auth.uid()));

grant select, insert on public.member_reports to authenticated;

create table if not exists public.member_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

alter table public.member_blocks enable row level security;

create policy "Members manage their own blocks"
on public.member_blocks for all to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

grant select, insert, delete on public.member_blocks to authenticated;

create table if not exists public.member_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  booking_updates boolean not null default true,
  message_updates boolean not null default true,
  review_reminders boolean not null default true,
  product_updates boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.member_notification_preferences enable row level security;

create policy "Members manage their own notification preferences"
on public.member_notification_preferences for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update on public.member_notification_preferences to authenticated;
