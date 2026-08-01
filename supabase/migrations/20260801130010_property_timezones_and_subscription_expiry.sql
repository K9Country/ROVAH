-- Store the place where each site operates. Subscription validity follows the
-- site's local clock, never the host's or guest's device clock.
alter table public.properties
  add column if not exists time_zone text not null default 'America/New_York';

-- Existing listings are Michigan sites and therefore use Eastern Time.
update public.properties set time_zone = 'America/Detroit' where state = 'MI';

alter table public.properties
  add constraint properties_time_zone_iana_check
  check (time_zone in ('America/New_York', 'America/Detroit', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'));

-- A one-month pass purchased on August 1 is valid through August 31 at 10 PM
-- in the property's time zone.
create or replace function public.activate_member_loyalty_pass_after_payment(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.member_loyalty_passes as pass
  set status = case when pass.credit_hours_remaining = 0 then 'exhausted' else 'active' end,
    activated_at = now(),
    expires_at = (
      date_trunc('day', now() at time zone property.time_zone)
      + make_interval(months => offer.duration_months)
      + time '22:00'
    ) at time zone property.time_zone,
    updated_at = now()
  from public.loyalty_pass_offers as offer
  join public.properties as property on property.id = offer.property_id
  where pass.purchase_booking_id = p_booking_id
    and pass.loyalty_pass_offer_id = offer.id
    and pass.status = 'payment_pending';
end;
$$;

-- Extend active passes to 10 PM on their final valid local day as well.
update public.member_loyalty_passes as pass
set expires_at = (
  date_trunc('day', pass.activated_at at time zone property.time_zone)
  + make_interval(months => offer.duration_months)
  + time '22:00'
) at time zone property.time_zone,
updated_at = now()
from public.loyalty_pass_offers as offer
join public.properties as property on property.id = offer.property_id
where pass.loyalty_pass_offer_id = offer.id
  and pass.status = 'active'
  and pass.activated_at is not null;
