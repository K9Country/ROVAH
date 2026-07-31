-- Promotions reach eligible ROVAH dog-owner accounts within 50 miles of the
-- promoted site. Eligibility remains server-side and only aggregate counts are
-- returned to hosts. A saved location is considered verified only when it is
-- held in promotion_location_points with the enforced verified_saved_address
-- source.

-- The original promotion schema restricted the stored radius to 25. Update
-- existing records before enforcing the new, single authoritative radius.
alter table public.local_promotions
  drop constraint if exists local_promotions_radius_miles_check;

update public.local_promotions
set radius_miles = 50
where radius_miles <> 50;

alter table public.local_promotions
  add constraint local_promotions_radius_miles_check check (radius_miles = 50);

create or replace function public.site_promotion_eligible_members(
  p_property_id uuid
)
returns table(member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select guest_profile.user_id
  from public.guest_profiles guest_profile
  join public.promotion_location_points member_point
    on member_point.member_id = guest_profile.user_id
   and member_point.source = 'verified_saved_address'
  join public.promotion_location_points property_point
    on property_point.property_id = p_property_id
   and property_point.source = 'verified_saved_address'
  where guest_profile.profile_completed_at is not null
    and exists (
      select 1
      from public.account_roles role
      where role.user_id = guest_profile.user_id
        and role.account_type = 'member'
    )
    -- Scoped to the exact promoted site. Completed visits and confirmed
    -- (including upcoming) bookings exclude the member; cancelled attempts do not.
    and not exists (
      select 1
      from public.bookings booking
      where booking.property_id = p_property_id
        and booking.guest_id = guest_profile.user_id
        and booking.status in ('confirmed', 'completed')
    )
    and 3958.7613 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(property_point.latitude::double precision))
        * cos(radians(member_point.latitude::double precision))
        * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision))
        + sin(radians(property_point.latitude::double precision))
        * sin(radians(member_point.latitude::double precision))
      ))
    ) <= 50;
$$;

-- The helper returns individual IDs internally, but is never callable from the
-- client. Hosts only receive the aggregate count returned with their draft.
revoke all on function public.site_promotion_eligible_members(uuid) from public, anon, authenticated;

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
      and source = 'verified_saved_address'
  ) then
    raise exception 'This site needs a verified location before a 50-mile audience can be calculated.';
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

  select count(*)::integer into audience_count
  from public.site_promotion_eligible_members(p_property_id);

  insert into public.local_promotions (
    host_id, property_id, message, message_hash, image_path,
    amount_cents, radius_miles, status, moderation_status,
    eligible_member_count, test_visible
  ) values (
    (select auth.uid()), p_property_id, normalized_message,
    md5(lower(normalized_message)), normalized_image_path,
    200, 50, 'draft', 'approved', audience_count, false
  ) returning * into created_promotion;

  return created_promotion;
end;
$$;

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

  return activated_promotion;
end;
$$;

revoke all on function public.create_site_promotion_draft(uuid, text, text) from public;
revoke execute on function public.create_site_promotion_draft(uuid, text, text) from anon;
grant execute on function public.create_site_promotion_draft(uuid, text, text) to authenticated;
revoke all on function public.activate_site_promotion_after_payment(uuid, text, text) from public, anon, authenticated;

-- Existing pre-payment drafts are recalculated under the same new rule. Paid
-- promotions retain their existing delivery records for audit integrity.
update public.local_promotions promotion
set radius_miles = 50,
    eligible_member_count = (
      select count(*)::integer
      from public.site_promotion_eligible_members(promotion.property_id)
    ),
    updated_at = now()
where promotion.status in ('draft', 'pending_payment');
