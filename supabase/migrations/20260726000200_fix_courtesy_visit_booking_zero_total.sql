-- Courtesy Visit reservations are real confirmed bookings with a $0 total.
-- Table aliases avoid conflicts with the function's returned `id` column.
create or replace function public.create_booking_with_dogs(
  p_property_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_dog_profile_ids uuid[],
  p_courtesy_visit_credit_id uuid default null,
  p_resolution_discount_offer_id uuid default null
)
returns table (id uuid, total_amount numeric, payment_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_booking public.bookings;
  selected_dog_count integer;
  courtesy_credit public.courtesy_visit_credits;
  discount_offer public.resolution_discount_offers;
  requested_hours numeric(6, 2);
  discounted_total numeric(10, 2);
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required to create a reservation';
  end if;

  if coalesce(cardinality(p_dog_profile_ids), 0) = 0 then
    raise exception 'Select at least one dog for this reservation';
  end if;

  if p_courtesy_visit_credit_id is not null and p_resolution_discount_offer_id is not null then
    raise exception 'Choose either a Courtesy Visit or a Special Discount for this reservation';
  end if;

  select count(*) into selected_dog_count
  from public.dog_profiles as dog
  where dog.user_id = (select auth.uid())
    and dog.id = any(p_dog_profile_ids);

  if selected_dog_count <> cardinality(p_dog_profile_ids) then
    raise exception 'Every selected dog must belong to your dog profiles';
  end if;

  requested_hours := round(extract(epoch from (p_end_at - p_start_at)) / 3600.0, 2);
  if requested_hours < 1 then
    raise exception 'Reservations require at least one hour';
  end if;

  if p_courtesy_visit_credit_id is not null then
    select * into courtesy_credit
    from public.courtesy_visit_credits as credit
    where credit.id = p_courtesy_visit_credit_id
      and credit.member_id = (select auth.uid())
      and credit.property_id = p_property_id
      and credit.status = 'active'
      and credit.expires_at >= current_date
    for update;

    if courtesy_credit.id is null or courtesy_credit.remaining_hours < requested_hours then
      raise exception 'That Courtesy Visit is unavailable for this reservation';
    end if;
  end if;

  if p_resolution_discount_offer_id is not null then
    select * into discount_offer
    from public.resolution_discount_offers as offer
    where offer.id = p_resolution_discount_offer_id
      and offer.member_id = (select auth.uid())
      and offer.property_id = p_property_id
      and offer.status = 'active'
      and offer.expires_at >= current_date
    for update;

    if discount_offer.id is null then
      raise exception 'That Special Discount is unavailable for this reservation';
    end if;
  end if;

  insert into public.bookings (property_id, guest_id, start_at, end_at, dog_count)
  values (p_property_id, (select auth.uid()), p_start_at, p_end_at, selected_dog_count)
  returning * into created_booking;

  insert into public.booking_dogs (booking_id, dog_profile_id, name)
  select created_booking.id, dog.id, dog.name
  from public.dog_profiles as dog
  where dog.user_id = (select auth.uid())
    and dog.id = any(p_dog_profile_ids);

  if courtesy_credit.id is not null then
    update public.courtesy_visit_credits as credit
    set remaining_hours = round(credit.remaining_hours - requested_hours, 2),
        status = case when credit.remaining_hours - requested_hours <= 0 then 'used' else 'active' end,
        updated_at = now()
    where credit.id = courtesy_credit.id;

    update public.bookings as booking
    set original_total_amount = created_booking.total_amount,
        total_amount = 0,
        status = 'confirmed',
        courtesy_visit_credit_id = courtesy_credit.id,
        courtesy_hours_applied = requested_hours,
        payment_status = 'paid',
        payment_provider = 'courtesy_visit',
        payment_updated_at = now()
    where booking.id = created_booking.id
    returning * into created_booking;
  elsif discount_offer.id is not null then
    discounted_total := round(created_booking.total_amount * (1 - discount_offer.discount_percent / 100.0), 2);

    update public.resolution_discount_offers as offer
    set status = 'used', updated_at = now()
    where offer.id = discount_offer.id;

    update public.bookings as booking
    set original_total_amount = created_booking.total_amount,
        total_amount = discounted_total,
        resolution_discount_offer_id = discount_offer.id,
        resolution_discount_percent = discount_offer.discount_percent,
        payment_provider = 'resolution_discount',
        payment_updated_at = now()
    where booking.id = created_booking.id
    returning * into created_booking;
  end if;

  return query select created_booking.id, created_booking.total_amount, created_booking.payment_status;
end;
$$;

revoke all on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid, uuid) to authenticated;
