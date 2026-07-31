-- Draft-only framework for paid local promotions. No payment, delivery, or
-- location matching is enabled by this migration. Those actions will be added
-- through a server-side Stripe/webhook and geocoding flow.

alter table public.member_notification_preferences
  add column if not exists local_promotions boolean not null default false;

create table public.local_promotions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 280),
  message_hash text not null,
  amount_cents integer not null default 499 check (amount_cents = 499),
  radius_miles smallint not null default 25 check (radius_miles = 25),
  status text not null default 'draft' check (status in ('draft', 'pending_payment', 'paid', 'scheduled', 'delivered', 'expired', 'rejected', 'failed', 'cancelled')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_reason text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  payment_confirmed_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  eligible_member_count integer not null default 0 check (eligible_member_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  viewed_count integer not null default 0 check (viewed_count >= 0),
  property_open_count integer not null default 0 check (property_open_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'delivered') = (starts_at is not null and ends_at is not null))
);

create index local_promotions_host_created_index
  on public.local_promotions (host_id, created_at desc);

create index local_promotions_property_status_index
  on public.local_promotions (property_id, status, created_at desc);

-- This table is intentionally private. A host gets only the aggregate counts
-- stored on local_promotions, never the identity of a member who received,
-- viewed, or opened a promotion.
create table public.local_promotion_deliveries (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.local_promotions(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  viewed_at timestamptz,
  property_opened_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (promotion_id, member_id)
);

create index local_promotion_deliveries_member_index
  on public.local_promotion_deliveries (member_id, created_at desc);

alter table public.local_promotions enable row level security;
alter table public.local_promotion_deliveries enable row level security;

create policy "Hosts can view their own local promotions"
on public.local_promotions for select to authenticated
using (host_id = (select auth.uid()));

create policy "Members can view their own promotion deliveries"
on public.local_promotion_deliveries for select to authenticated
using (member_id = (select auth.uid()));

revoke all on table public.local_promotions from anon;
revoke all on table public.local_promotion_deliveries from anon;
grant select on table public.local_promotions to authenticated;
grant select on table public.local_promotion_deliveries to authenticated;

create or replace function public.create_local_promotion_draft(
  p_property_id uuid,
  p_message text
)
returns public.local_promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_promotion public.local_promotions;
  normalized_message text := trim(p_message);
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  if not exists (
    select 1
    from public.properties
    where id = p_property_id
      and host_id = (select auth.uid())
      and is_published = true
  ) then
    raise exception 'Choose one of your approved, published private spaces';
  end if;

  if char_length(normalized_message) not between 1 and 280 then
    raise exception 'Promotion messages must be between 1 and 280 characters';
  end if;

  -- Baseline automatic screen. The payment flow will run a fuller moderation
  -- check before it can create a checkout session or deliver a promotion.
  if lower(normalized_message) ~ '(https?://|www\\.|venmo|cashapp|paypal|wire transfer|text me|call me)' then
    raise exception 'Please remove outside payment or contact requests from this promotion';
  end if;

  if exists (
    select 1
    from public.local_promotions
    where property_id = p_property_id
      and host_id = (select auth.uid())
      and status in ('draft', 'pending_payment', 'paid', 'scheduled', 'delivered')
      and created_at > now() - interval '7 days'
  ) then
    raise exception 'This property already has a recent promotion. Finish or wait before creating another.';
  end if;

  insert into public.local_promotions (
    host_id, property_id, message, message_hash
  ) values (
    (select auth.uid()), p_property_id, normalized_message, md5(lower(normalized_message))
  ) returning * into created_promotion;

  return created_promotion;
end;
$$;

revoke all on function public.create_local_promotion_draft(uuid, text) from public;
grant execute on function public.create_local_promotion_draft(uuid, text) to authenticated;
