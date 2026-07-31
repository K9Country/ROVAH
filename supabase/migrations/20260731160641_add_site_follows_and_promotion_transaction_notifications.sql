-- A Follow is an explicit, durable member-to-site connection. It replaces the
-- former member-facing Like action and is intentionally separate from private
-- discovery analytics such as a promotion property-open.
create table if not exists public.property_follows (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (member_id, property_id)
);

create index if not exists property_follows_member_created_index
  on public.property_follows (member_id, created_at desc);
create index if not exists property_follows_property_index
  on public.property_follows (property_id);

alter table public.property_follows enable row level security;
revoke all on table public.property_follows from anon;
grant select, insert, delete on table public.property_follows to authenticated;
grant all on table public.property_follows to service_role;

create policy "Members can view their own site follows"
on public.property_follows for select to authenticated
using (
  (select auth.uid()) = member_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "Members can follow a site for themselves"
on public.property_follows for insert to authenticated
with check (
  (select auth.uid()) = member_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and exists (
    select 1 from public.account_roles role
    where role.user_id = (select auth.uid()) and role.account_type = 'member'
  )
);

create policy "Members can unfollow their own sites"
on public.property_follows for delete to authenticated
using (
  (select auth.uid()) = member_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

-- A durable record backs the host popup so Stripe confirmation is never lost
-- when the host returns from Checkout or closes the app.
create table if not exists public.host_promotion_notifications (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  promotion_id uuid not null references public.local_promotions(id) on delete cascade,
  kind text not null check (kind in ('payment_processing', 'paid_and_sent', 'payment_not_completed')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists host_promotion_notifications_once_per_kind
  on public.host_promotion_notifications (promotion_id, kind);
create index if not exists host_promotion_notifications_host_created_index
  on public.host_promotion_notifications (host_id, created_at desc);

alter table public.host_promotion_notifications enable row level security;
revoke all on table public.host_promotion_notifications from anon;
grant select, update on table public.host_promotion_notifications to authenticated;
grant all on table public.host_promotion_notifications to service_role;

create policy "Hosts can read their promotion notifications"
on public.host_promotion_notifications for select to authenticated
using (
  (select auth.uid()) = host_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "Hosts can mark their promotion notifications read"
on public.host_promotion_notifications for update to authenticated
using (
  (select auth.uid()) = host_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
)
with check (
  (select auth.uid()) = host_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

-- Promotion opportunity means a new, notification-enabled local member who
-- has neither followed nor successfully reserved the same private space.
create or replace function public.site_promotion_eligible_members(p_property_id uuid)
returns table(member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select guest_profile.user_id
  from public.guest_profiles guest_profile
  join public.member_notification_preferences preference
    on preference.user_id = guest_profile.user_id
   and preference.local_promotions = true
  join public.promotion_location_points member_point
    on member_point.member_id = guest_profile.user_id
   and member_point.source = 'verified_saved_address'
  join public.promotion_location_points property_point
    on property_point.property_id = p_property_id
   and property_point.source = 'geocoded_site_address'
  where guest_profile.profile_completed_at is not null
    and exists (
      select 1 from public.account_roles role
      where role.user_id = guest_profile.user_id and role.account_type = 'member'
    )
    and not exists (
      select 1 from public.property_follows follow
      where follow.property_id = p_property_id and follow.member_id = guest_profile.user_id
    )
    and not exists (
      select 1 from public.bookings booking
      where booking.property_id = p_property_id
        and booking.guest_id = guest_profile.user_id
        and booking.status in ('confirmed', 'completed')
    )
    and 3958.7613 * acos(least(1.0, greatest(-1.0,
      cos(radians(property_point.latitude::double precision))
      * cos(radians(member_point.latitude::double precision))
      * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision))
      + sin(radians(property_point.latitude::double precision))
      * sin(radians(member_point.latitude::double precision))
    ))) <= 50;
$$;

-- Keep paid promotions visible and measurable for their whole seven-day
-- campaign, then retain their aggregate record as history.
create or replace function public.activate_site_promotion_after_payment(
  p_promotion_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text default null
)
returns public.local_promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  activated_promotion public.local_promotions;
  inserted_count integer := 0;
begin
  update public.local_promotions
  set status = 'active',
      stripe_checkout_session_id = p_checkout_session_id,
      stripe_payment_intent_id = p_payment_intent_id,
      payment_confirmed_at = now(),
      starts_at = now(),
      ends_at = now() + interval '7 days',
      updated_at = now(),
      test_visible = false
  where id = p_promotion_id and status = 'pending_payment'
  returning * into activated_promotion;

  if activated_promotion.id is null then
    select * into activated_promotion from public.local_promotions where id = p_promotion_id;
    if activated_promotion.id is null or activated_promotion.stripe_checkout_session_id <> p_checkout_session_id then
      raise exception 'Promotion is not awaiting a verified payment';
    end if;
    return activated_promotion;
  end if;

  insert into public.local_promotion_deliveries (promotion_id, member_id, delivered_at)
  select activated_promotion.id, eligible.member_id, now()
  from public.site_promotion_eligible_members(activated_promotion.property_id) eligible
  on conflict (promotion_id, member_id) do nothing;
  get diagnostics inserted_count = row_count;

  update public.local_promotions
  set eligible_member_count = inserted_count,
      delivered_count = inserted_count,
      updated_at = now()
  where id = activated_promotion.id
  returning * into activated_promotion;

  insert into public.host_promotion_notifications (host_id, promotion_id, kind, title, body)
  values (
    activated_promotion.host_id,
    activated_promotion.id,
    'paid_and_sent',
    'Promotion paid and sent',
    format('Your $2 promotion was paid and sent to %s eligible new local guest%s within 50 miles.', inserted_count, case when inserted_count = 1 then '' else 's' end)
  ) on conflict (promotion_id, kind) do nothing;

  return activated_promotion;
end;
$$;

revoke all on function public.site_promotion_eligible_members(uuid) from public, anon, authenticated;
revoke all on function public.activate_site_promotion_after_payment(uuid, text, text) from public, anon, authenticated;
