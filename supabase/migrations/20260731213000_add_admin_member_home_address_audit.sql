create or replace function public.get_member_home_address_audit(p_property_id uuid)
returns table(member_id uuid, member_name text, address_line1 text, address_line2 text, city text, state text, postal_code text, distance_miles numeric, inside_50_miles boolean, connected_to_site boolean, local_promotions_enabled boolean)
language sql security definer set search_path = '' as $$
  select guest_profile.user_id, guest_profile.full_name, guest_profile.address_line1, guest_profile.address_line2, guest_profile.city, guest_profile.state, guest_profile.postal_code,
    round((3958.7613 * acos(least(1.0, greatest(-1.0, cos(radians(property_point.latitude::double precision)) * cos(radians(member_point.latitude::double precision)) * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision)) + sin(radians(property_point.latitude::double precision)) * sin(radians(member_point.latitude::double precision))))))::numeric, 1) as distance_miles,
    (3958.7613 * acos(least(1.0, greatest(-1.0, cos(radians(property_point.latitude::double precision)) * cos(radians(member_point.latitude::double precision)) * cos(radians(member_point.longitude::double precision) - radians(property_point.longitude::double precision)) + sin(radians(property_point.latitude::double precision)) * sin(radians(member_point.latitude::double precision)))) <= 50) as inside_50_miles,
    (exists (select 1 from public.property_follows follow where follow.property_id = p_property_id and follow.member_id = guest_profile.user_id) or exists (select 1 from public.bookings booking where booking.property_id = p_property_id and booking.guest_id = guest_profile.user_id and booking.status in ('confirmed', 'completed'))) as connected_to_site,
    coalesce(preference.local_promotions, false) as local_promotions_enabled
  from public.guest_profiles guest_profile
  join public.account_roles role on role.user_id = guest_profile.user_id and role.account_type = 'member'
  left join public.member_notification_preferences preference on preference.user_id = guest_profile.user_id
  left join public.promotion_location_points member_point on member_point.member_id = guest_profile.user_id and member_point.source = 'verified_saved_address'
  left join public.promotion_location_points property_point on property_point.property_id = p_property_id and property_point.source = 'geocoded_site_address'
  where guest_profile.profile_completed_at is not null and exists (select 1 from public.admin_users administrator where administrator.user_id = (select auth.uid())) and exists (select 1 from public.properties property where property.id = p_property_id)
  order by distance_miles nulls last, guest_profile.full_name;
$$;
revoke all on function public.get_member_home_address_audit(uuid) from public;
grant execute on function public.get_member_home_address_audit(uuid) to authenticated;
