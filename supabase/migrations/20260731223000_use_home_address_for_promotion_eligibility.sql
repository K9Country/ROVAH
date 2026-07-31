create or replace function public.site_promotion_eligible_members(p_property_id uuid)
returns table(member_id uuid)
language sql stable security definer set search_path = '' as $$
  select guest_profile.user_id
  from public.guest_profiles guest_profile
  join public.promotion_location_points member_point on member_point.member_id = guest_profile.user_id and member_point.source = 'verified_saved_address'
  join public.promotion_location_points property_point on property_point.property_id = p_property_id and property_point.source = 'geocoded_site_address'
  where guest_profile.profile_completed_at is not null
    and exists (select 1 from public.account_roles role where role.user_id = guest_profile.user_id and role.account_type = 'member')
    and not exists (select 1 from public.property_follows follow where follow.property_id = p_property_id and follow.member_id = guest_profile.user_id)
    and not exists (select 1 from public.bookings booking where booking.property_id = p_property_id and booking.guest_id = guest_profile.user_id and booking.status in ('confirmed', 'completed'))
    and 3958.7613 * acos(least(1.0, greatest(-1.0,
      cos(radians(property_point.latitude::double precision)) * cos(radians(member_point.latitude::double precision))
      * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision))
      + sin(radians(property_point.latitude::double precision)) * sin(radians(member_point.latitude::double precision))
    ))) <= 50;
$$;
