-- A member can buy one host-created subscription package at a time, then
-- redeem its prepaid base-hour credits on future reservations at that site.
-- Extra-dog charges stay outside the credit package and are processed through
-- the normal reservation payment flow.

create table if not exists public.member_loyalty_passes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  loyalty_pass_offer_id uuid not null references public.loyalty_pass_offers(id) on delete restrict,
  purchase_booking_id uuid unique references public.bookings(id) on delete set null,
  credit_hours_total numeric(6, 2) not null check (credit_hours_total > 0),
  credit_hours_remaining numeric(6, 2) not null check (credit_hours_remaining >= 0 and credit_hours_remaining <= credit_hours_total),
  purchase_price numeric(10, 2) not null check (purchase_price > 0),
  status text not null default 'payment_pending' check (status in ('payment_pending', 'active', 'exhausted', 'expired', 'cancelled')),
  activated_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_loyalty_passes_member_property_idx
  on public.member_loyalty_passes (member_id, property_id, status, expires_at);

alter table public.member_loyalty_passes enable row level security;

drop policy if exists "Members can view their own loyalty passes" on public.member_loyalty_passes;
create policy "Members can view their own loyalty passes"
on public.member_loyalty_passes for select
to authenticated
using (
  member_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

grant select on public.member_loyalty_passes to authenticated;

alter table public.bookings
  add column if not exists loyalty_pass_offer_id uuid references public.loyalty_pass_offers(id),
  add column if not exists member_loyalty_pass_id uuid references public.member_loyalty_passes(id),
  add column if not exists loyalty_pass_credit_hours_applied numeric(6, 2) not null default 0
    check (loyalty_pass_credit_hours_applied >= 0);

-- This separate RPC leaves the existing booking function available to every
-- current caller while adding the member's explicit rate choice safely.
create or replace function public.create_booking_with_dogs_and_subscription(
  p_property_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_dog_profile_ids uuid[],
  p_courtesy_visit_credit_id uuid default null,
  p_resolution_discount_offer_id uuid default null,
  p_loyalty_pass_offer_id uuid default null
)
returns table (id uuid, total_amount numeric, payment_status text, payment_provider text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_booking public.bookings;
  selected_dog_count integer;
  courtesy_credit public.courtesy_visit_credits;
  discount_offer public.resolution_discount_offers;
  loyalty_offer public.loyalty_pass_offers;
  member_pass public.member_loyalty_passes;
  requested_hours numeric(6, 2);
  discounted_total numeric(10, 2);
  extra_dog_total numeric(10, 2);
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required to create a reservation';
  end if;
  if coalesce(cardinality(p_dog_profile_ids), 0) = 0 then
    raise exception 'Select at least one dog for this reservation';
  end if;
  if p_loyalty_pass_offer_id is not null
    and (p_courtesy_visit_credit_id is not null or p_resolution_discount_offer_id is not null) then
    raise exception 'Choose either a Subscription, a Courtesy Waiver, a Special Discount, or the regular rate';
  end if;
  if p_courtesy_visit_credit_id is not null and p_resolution_discount_offer_id is not null then
    raise exception 'Choose either a Courtesy Waiver or a Special Discount for this reservation';
  end if;

  select count(*) into selected_dog_count
  from public.dog_profiles as dog
  where dog.user_id = (select auth.uid()) and dog.id = any(p_dog_profile_ids);
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
      and credit.expires_at > now()
      and credit.remaining_hours >= requested_hours
    for update;
    if courtesy_credit.id is null then
      raise exception 'That Courtesy Waiver is unavailable for this reservation';
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

  if p_loyalty_pass_offer_id is not null then
    select * into loyalty_offer
    from public.loyalty_pass_offers as offer
    where offer.id = p_loyalty_pass_offer_id
      and offer.property_id = p_property_id
      and offer.is_active = true
    for update;
    if loyalty_offer.id is null then
      raise exception 'That Subscription is no longer available for this private space';
    end if;
    if loyalty_offer.credit_count < requested_hours then
      raise exception 'This Subscription includes % credit hours. Choose a visit that fits within those credits or pay the regular rate.', loyalty_offer.credit_count;
    end if;
  end if;

  insert into public.bookings (property_id, guest_id, start_at, end_at, dog_count)
  values (p_property_id, (select auth.uid()), p_start_at, p_end_at, selected_dog_count)
  returning * into created_booking;

  insert into public.booking_dogs (booking_id, dog_profile_id, name)
  select created_booking.id, dog.id, dog.name
  from public.dog_profiles as dog
  where dog.user_id = (select auth.uid()) and dog.id = any(p_dog_profile_ids);

  if courtesy_credit.id is not null then
    update public.courtesy_visit_credits as credit
    set status = 'reserved', reserved_booking_id = created_booking.id, reserved_at = now(), updated_at = now()
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
  elsif loyalty_offer.id is not null then
    -- Credits cover the standard first-dog hourly amount. Any additional-dog
    -- amount remains payable for this specific visit.
    extra_dog_total := greatest(
      round(created_booking.total_amount - (requested_hours * created_booking.hourly_rate), 2),
      0
    );

    select * into member_pass
    from public.member_loyalty_passes as pass
    where pass.member_id = (select auth.uid())
      and pass.property_id = p_property_id
      and pass.loyalty_pass_offer_id = loyalty_offer.id
      and pass.status = 'active'
      and pass.expires_at > now()
      and pass.credit_hours_remaining >= requested_hours
    order by pass.expires_at asc, pass.created_at asc
    limit 1
    for update skip locked;

    if member_pass.id is not null then
      update public.member_loyalty_passes as pass
      set credit_hours_remaining = round(pass.credit_hours_remaining - requested_hours, 2),
        status = case when round(pass.credit_hours_remaining - requested_hours, 2) = 0 then 'exhausted' else 'active' end,
        updated_at = now()
      where pass.id = member_pass.id;

      update public.bookings as booking
      set original_total_amount = created_booking.total_amount,
        total_amount = extra_dog_total,
        status = case when extra_dog_total = 0 then 'confirmed' else booking.status end,
        payment_status = case when extra_dog_total = 0 then 'paid' else booking.payment_status end,
        payment_provider = 'loyalty_pass',
        loyalty_pass_offer_id = loyalty_offer.id,
        member_loyalty_pass_id = member_pass.id,
        loyalty_pass_credit_hours_applied = requested_hours,
        payment_updated_at = now()
      where booking.id = created_booking.id
      returning * into created_booking;
    else
      update public.bookings as booking
      set original_total_amount = created_booking.total_amount,
        total_amount = round(loyalty_offer.package_price + extra_dog_total, 2),
        loyalty_pass_offer_id = loyalty_offer.id,
        payment_provider = 'loyalty_pass_purchase',
        payment_updated_at = now()
      where booking.id = created_booking.id
      returning * into created_booking;

      insert into public.member_loyalty_passes (
        member_id, property_id, loyalty_pass_offer_id, purchase_booking_id,
        credit_hours_total, credit_hours_remaining, purchase_price, status
      ) values (
        (select auth.uid()), p_property_id, loyalty_offer.id, created_booking.id,
        loyalty_offer.credit_count, round(loyalty_offer.credit_count - requested_hours, 2), loyalty_offer.package_price, 'payment_pending'
      );
    end if;
  end if;

  return query
  select created_booking.id, created_booking.total_amount, created_booking.payment_status, created_booking.payment_provider;
end;
$$;

-- A captured subscription purchase is activated only after the first payment
-- succeeds, so a member cannot spend credits before Stripe has collected it.
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
    expires_at = now() + make_interval(months => offer.duration_months),
    updated_at = now()
  from public.loyalty_pass_offers as offer
  where pass.purchase_booking_id = p_booking_id
    and pass.loyalty_pass_offer_id = offer.id
    and pass.status = 'payment_pending';
end;
$$;

revoke all on function public.create_booking_with_dogs_and_subscription(uuid, timestamptz, timestamptz, uuid[], uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_booking_with_dogs_and_subscription(uuid, timestamptz, timestamptz, uuid[], uuid, uuid, uuid) to authenticated;
revoke all on function public.activate_member_loyalty_pass_after_payment(uuid) from public, anon, authenticated;
grant execute on function public.activate_member_loyalty_pass_after_payment(uuid) to service_role;
