-- The public listing needs a site-level completed-reservation count without
-- revealing booking rows, guests, dates, or any other private booking data.
create or replace function public.get_completed_reservation_count(p_property_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.bookings as booking
  where booking.property_id = p_property_id
    and booking.status = 'confirmed'
    and booking.end_at <= now()
    and exists (
      select 1
      from public.properties as property
      where property.id = p_property_id
        and property.is_published = true
    );
$$;

revoke all on function public.get_completed_reservation_count(uuid) from public, anon, authenticated;
grant execute on function public.get_completed_reservation_count(uuid) to anon, authenticated;
