-- Site-scoped, paid in-app promotions.  A promotion is never made visible to
-- members by a client-side flag: it requires a verified payment activation.

-- Keep precise promotion coordinates private.  They are populated only by a
-- trusted server-side address-verification/geocoding process from an existing
-- saved address; neither hosts nor other members receive access to this table.
create table if not exists public.promotion_location_points (
  id uuid primary key default gen_random_uuid(),
  property_id uuid unique references public.properties(id) on delete cascade,
  member_id uuid unique references auth.users(id) on delete cascade,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  source text not null default 'verified_saved_address'
    check (source in ('verified_saved_address')),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (property_id is not null and member_id is null)
    or (property_id is null and member_id is not null)
  )
);

create index if not exists promotion_location_points_member_index
  on public.promotion_location_points (member_id)
  where member_id is not null;

alter table public.promotion_location_points enable row level security;
revoke all on table public.promotion_location_points from public, anon, authenticated;

-- Retire the earlier free test visibility path.  Test rows remain in the host
-- history, but cannot be delivered or shown to members.
update public.local_promotions
set test_visible = false,
    moderation_reason = coalesce(moderation_reason, 'Retired free test promotion')
where test_visible = true;

drop policy if exists "Authenticated users can view visible test promotions" on public.local_promotions;
drop policy if exists "Authenticated users can view visible test promotion images" on storage.objects;

alter table public.local_promotions
  alter column amount_cents set default 200;

alter table public.local_promotions
  drop constraint if exists local_promotions_status_check;
alter table public.local_promotions
  add constraint local_promotions_status_check
  check (status in ('draft', 'pending_payment', 'active', 'expired', 'rejected', 'failed', 'cancelled'));

-- A member can read a promotion only after a private, member-specific
-- delivery was created following payment confirmation.
create policy "Members can view their delivered active promotions"
  on public.local_promotions
  for select
  to authenticated
  using (
    status = 'active'
    and starts_at <= now()
    and ends_at > now()
    and exists (
      select 1
      from public.local_promotion_deliveries delivery
      where delivery.promotion_id = local_promotions.id
        and delivery.member_id = (select auth.uid())
        and delivery.dismissed_at is null
    )
  );

create policy "Members can view their delivered promotion images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'promotion-images'
    and exists (
      select 1
      from public.local_promotions promotion
      join public.local_promotion_deliveries delivery
        on delivery.promotion_id = promotion.id
      where promotion.image_path = storage.objects.name
        and promotion.status = 'active'
        and promotion.starts_at <= now()
        and promotion.ends_at > now()
        and delivery.member_id = (select auth.uid())
        and delivery.dismissed_at is null
    )
  );

-- Create a private, reviewable promotion draft and calculate only an aggregate
-- audience count.  Dog-owner eligibility means a completed member profile,
-- an explicit member account role (including dual-role users), an opt-in, and
-- a private verified point within 25 miles of this exact property.
create or replace function public.create_site_promotion_draft(
  p_property_id uuid,
  p_message text,
  p_image_path text default null
)
returns public.local_promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_promotion public.local_promotions;
  normalized_message text := trim(p_message);
  normalized_image_path text := nullif(trim(p_image_path), '');
  audience_count integer := 0;
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = p_property_id
      and host_id = (select auth.uid())
      and is_published = true
  ) then
    raise exception 'Choose one of your approved, published private spaces';
  end if;

  if not exists (
    select 1 from public.promotion_location_points
    where property_id = p_property_id
  ) then
    raise exception 'This site needs a verified location before a 25-mile audience can be calculated.';
  end if;

  if char_length(normalized_message) not between 1 and 280 then
    raise exception 'Promotion messages must be between 1 and 280 characters';
  end if;

  if lower(normalized_message) ~ '(https?://|www\\.|venmo|cashapp|paypal|wire transfer|text me|call me|free money|hate|kill)' then
    raise exception 'Please revise this promotion so it does not include outside contact, payment requests, or inappropriate language.';
  end if;

  if normalized_image_path is not null and (
    char_length(normalized_image_path) > 512
    or split_part(normalized_image_path, '/', 1) <> (select auth.uid()::text)
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'promotion-images'
        and name = normalized_image_path
        and owner_id = (select auth.uid())
    )
  ) then
    raise exception 'Choose a valid photo from your device';
  end if;

  if exists (
    select 1 from public.local_promotions
    where property_id = p_property_id
      and host_id = (select auth.uid())
      and status in ('draft', 'pending_payment', 'active')
      and created_at > now() - interval '7 days'
  ) then
    raise exception 'This site already has a current promotion. Finish, cancel, or wait before creating another.';
  end if;

  audience_count := (
  select count(*)::integer
  from public.guest_profiles guest_profile
  join public.member_notification_preferences preference
    on preference.user_id = guest_profile.user_id
   and preference.local_promotions = true
  join public.promotion_location_points member_point
    on member_point.member_id = guest_profile.user_id
  join public.promotion_location_points property_point
    on property_point.property_id = p_property_id
  where guest_profile.profile_completed_at is not null
    and exists (
      select 1 from public.account_roles role
      where role.user_id = guest_profile.user_id
        and role.account_type = 'member'
    )
    and 3958.7613 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(property_point.latitude::double precision))
        * cos(radians(member_point.latitude::double precision))
        * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision))
        + sin(radians(property_point.latitude::double precision))
        * sin(radians(member_point.latitude::double precision))
      ))
    ) <= 25
  );

  insert into public.local_promotions (
    host_id, property_id, message, message_hash, image_path,
    amount_cents, radius_miles, status, moderation_status,
    eligible_member_count, test_visible
  ) values (
    (select auth.uid()), p_property_id, normalized_message,
    md5(lower(normalized_message)), normalized_image_path,
    200, 25, 'draft', 'approved', audience_count, false
  ) returning * into created_promotion;

  return created_promotion;
end;
$$;

revoke all on function public.create_site_promotion_draft(uuid, text, text) from public;
revoke execute on function public.create_site_promotion_draft(uuid, text, text) from anon;
grant execute on function public.create_site_promotion_draft(uuid, text, text) to authenticated;

-- Webhook-only activation.  It is intentionally not available to an app user;
-- it inserts private recipient deliveries only after Stripe confirms payment.
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
      ends_at = now() + interval '24 hours',
      updated_at = now(),
      test_visible = false
  where id = p_promotion_id
    and status = 'pending_payment'
  returning * into activated_promotion;

  if activated_promotion.id is null then
    raise exception 'Promotion is not awaiting a verified payment';
  end if;

  insert into public.local_promotion_deliveries (promotion_id, member_id, delivered_at)
  select activated_promotion.id, guest_profile.user_id, now()
  from public.guest_profiles guest_profile
  join public.member_notification_preferences preference
    on preference.user_id = guest_profile.user_id
   and preference.local_promotions = true
  join public.promotion_location_points member_point
    on member_point.member_id = guest_profile.user_id
  join public.promotion_location_points property_point
    on property_point.property_id = activated_promotion.property_id
  where guest_profile.profile_completed_at is not null
    and exists (
      select 1 from public.account_roles role
      where role.user_id = guest_profile.user_id
        and role.account_type = 'member'
    )
    and 3958.7613 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(property_point.latitude::double precision))
        * cos(radians(member_point.latitude::double precision))
        * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision))
        + sin(radians(property_point.latitude::double precision))
        * sin(radians(member_point.latitude::double precision))
      ))
    ) <= 25
  on conflict (promotion_id, member_id) do nothing;

  get diagnostics inserted_count = row_count;

  update public.local_promotions
  set eligible_member_count = inserted_count,
      delivered_count = inserted_count,
      updated_at = now()
  where id = activated_promotion.id
  returning * into activated_promotion;

  return activated_promotion;
end;
$$;

revoke all on function public.activate_site_promotion_after_payment(uuid, text, text) from public, anon, authenticated;

-- The recipient can record only their own in-app view/open.  Host reporting
-- stays aggregate on local_promotions.
create or replace function public.record_local_promotion_engagement(
  p_promotion_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_action not in ('viewed', 'opened') then
    raise exception 'Invalid promotion activity';
  end if;

  if p_action = 'viewed' then
    update public.local_promotion_deliveries
    set viewed_at = coalesce(viewed_at, now())
    where promotion_id = p_promotion_id
      and member_id = (select auth.uid());
    update public.local_promotions
    set viewed_count = (
      select count(*) from public.local_promotion_deliveries
      where promotion_id = p_promotion_id and viewed_at is not null
    ), updated_at = now()
    where id = p_promotion_id;
  else
    update public.local_promotion_deliveries
    set property_opened_at = coalesce(property_opened_at, now())
    where promotion_id = p_promotion_id
      and member_id = (select auth.uid());
    update public.local_promotions
    set property_open_count = (
      select count(*) from public.local_promotion_deliveries
      where promotion_id = p_promotion_id and property_opened_at is not null
    ), updated_at = now()
    where id = p_promotion_id;
  end if;
end;
$$;

revoke all on function public.record_local_promotion_engagement(uuid, text) from public;
revoke execute on function public.record_local_promotion_engagement(uuid, text) from anon;
grant execute on function public.record_local_promotion_engagement(uuid, text) to authenticated;
