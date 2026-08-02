-- Subscription purchases are never refunded. Cancelling an eligible visit
-- changes the reservation only and restores the visit credit in one short,
-- locked transaction.
create or replace function public.cancel_subscription_reservation(
  p_booking_id uuid,
  p_actor_id uuid
)
returns table (cancelled boolean, payment_released boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  property_host_id uuid;
  member_pass public.member_loyalty_passes%rowtype;
  restored_credits numeric(6, 2);
begin
  perform set_config('lock_timeout', '10s', true);

  select * into booking
  from public.bookings
  where id = p_booking_id
  for update;

  if booking.id is null then
    raise exception 'This reservation is no longer available to cancel';
  end if;

  select host_id into property_host_id
  from public.properties
  where id = booking.property_id;

  if booking.guest_id <> p_actor_id and property_host_id <> p_actor_id then
    raise exception 'You do not have permission to cancel this reservation';
  end if;

  if booking.status not in ('confirmed', 'payment_pending') then
    raise exception 'This reservation is no longer available to cancel';
  end if;

  if booking.start_at <= now() + interval '1 hour' then
    raise exception 'The cancellation window closed one hour before this visit.';
  end if;

  if booking.member_loyalty_pass_id is null and booking.loyalty_pass_offer_id is null then
    raise exception 'This is not a subscription reservation';
  end if;

  -- Keep payment_status as paid: a subscription purchase is non-refundable.
  update public.bookings
  set status = 'cancelled',
      payment_updated_at = now()
  where id = booking.id;

  if booking.member_loyalty_pass_id is not null
    and coalesce(booking.loyalty_pass_credit_hours_applied, 0) > 0 then
    select * into member_pass
    from public.member_loyalty_passes
    where id = booking.member_loyalty_pass_id
    for update;

    if member_pass.id is not null and member_pass.status in ('active', 'exhausted') then
      update public.member_loyalty_passes
      set credit_hours_remaining = least(
            credit_hours_total,
            credit_hours_remaining + booking.loyalty_pass_credit_hours_applied
          ),
          status = 'active',
          updated_at = now()
      where id = member_pass.id;
    end if;
  elsif booking.loyalty_pass_offer_id is not null then
    -- The first reservation is the subscription purchase booking itself, so
    -- restore its included visit to the active pass rather than refunding it.
    select * into member_pass
    from public.member_loyalty_passes
    where purchase_booking_id = booking.id
    for update;

    if member_pass.id is not null and member_pass.status in ('active', 'exhausted') then
      restored_credits := greatest(
        1,
        extract(epoch from booking.end_at - booking.start_at) / 3600
      );
      update public.member_loyalty_passes
      set credit_hours_remaining = least(
            credit_hours_total,
            credit_hours_remaining + restored_credits
          ),
          status = 'active',
          updated_at = now()
      where id = member_pass.id;
    elsif member_pass.id is not null and member_pass.status = 'payment_pending' then
      update public.member_loyalty_passes
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = member_pass.id;
    end if;
  end if;

  return query select true, false;
end;
$$;

revoke all on function public.cancel_subscription_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_subscription_reservation(uuid, uuid) to service_role;
