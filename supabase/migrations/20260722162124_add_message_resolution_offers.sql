-- One-time host-issued discounts for a member's next reservation at a specific
-- property. Courtesy Visits remain separate because they are entirely free.

create table public.resolution_discount_offers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  issued_by uuid not null references auth.users(id) on delete restrict,
  discount_percent numeric(5, 2) not null check (discount_percent > 0 and discount_percent <= 85),
  expires_at date not null,
  note text check (note is null or char_length(btrim(note)) <= 280),
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index resolution_discount_offers_member_property_idx
  on public.resolution_discount_offers (member_id, property_id, status, expires_at);

alter table public.resolution_discount_offers enable row level security;
revoke all on table public.resolution_discount_offers from anon, authenticated;
grant select on table public.resolution_discount_offers to authenticated;

create policy "Members can view their resolution discounts"
on public.resolution_discount_offers
for select to authenticated
using ((select auth.uid()) = member_id);

create policy "Hosts can view resolution discounts for their properties"
on public.resolution_discount_offers
for select to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = resolution_discount_offers.property_id
      and properties.host_id = (select auth.uid())
  )
);

alter table public.bookings
  add column original_total_amount numeric(10, 2) check (original_total_amount is null or original_total_amount >= 0),
  add column resolution_discount_offer_id uuid references public.resolution_discount_offers(id) on delete set null,
  add column resolution_discount_percent numeric(5, 2) not null default 0 check (resolution_discount_percent >= 0 and resolution_discount_percent <= 85);

create index bookings_resolution_discount_offer_idx
  on public.bookings (resolution_discount_offer_id);

-- Keep Courtesy Visit notifications working with the current one-thread-per-
--host-and-member conversation model.
create or replace function public.issue_courtesy_visit(
  p_property_id uuid,
  p_member_id uuid,
  p_hours numeric,
  p_expires_at date,
  p_note text default null
)
returns public.courtesy_visit_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_credit public.courtesy_visit_credits;
  conversation_id uuid;
  property_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required';
  end if;

  select name into property_name
  from public.properties
  where id = p_property_id and host_id = (select auth.uid());

  if property_name is null then
    raise exception 'Only the host of this property can issue a Courtesy Visit';
  end if;

  if not exists (
    select 1 from public.guest_profiles
    where user_id = p_member_id and profile_completed_at is not null
  ) then
    raise exception 'Courtesy Visits can only be issued to a completed member profile';
  end if;

  if p_hours is null or p_hours <= 0 or p_hours > 100 then
    raise exception 'Courtesy Visit hours must be between 0.5 and 100';
  end if;

  if p_expires_at is null or p_expires_at < current_date then
    raise exception 'Choose an expiration date in the future';
  end if;

  insert into public.courtesy_visit_credits (
    property_id, member_id, issued_by, initial_hours, remaining_hours, expires_at, note
  ) values (
    p_property_id, p_member_id, (select auth.uid()), round(p_hours, 2), round(p_hours, 2), p_expires_at, nullif(btrim(p_note), '')
  ) returning * into created_credit;

  insert into public.property_conversations (property_id, guest_id, host_id)
  values (p_property_id, p_member_id, (select auth.uid()))
  on conflict (host_id, guest_id) do update set host_id = excluded.host_id
  returning id into conversation_id;

  insert into public.property_messages (conversation_id, sender_id, message_text)
  values (
    conversation_id,
    (select auth.uid()),
    format(
      'A Courtesy Visit has been issued for you at %s. You have %s free hour%s available through %s. It will be available when you make your next reservation for this private space.%s',
      property_name,
      trim(to_char(created_credit.remaining_hours, 'FM999990.00')),
      case when created_credit.remaining_hours = 1 then '' else 's' end,
      to_char(created_credit.expires_at, 'FMMonth FMDD, YYYY'),
      case when created_credit.note is null then '' else E'\n\nNote from your host: ' || created_credit.note end
    )
  );

  return created_credit;
end;
$$;

create or replace function public.issue_resolution_discount(
  p_property_id uuid,
  p_member_id uuid,
  p_discount_percent numeric,
  p_expires_at date,
  p_note text default null
)
returns public.resolution_discount_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_offer public.resolution_discount_offers;
  conversation_id uuid;
  property_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required';
  end if;

  select name into property_name
  from public.properties
  where id = p_property_id and host_id = (select auth.uid());

  if property_name is null then
    raise exception 'Only the host of this property can issue a Resolution Discount';
  end if;

  if not exists (
    select 1 from public.guest_profiles
    where user_id = p_member_id and profile_completed_at is not null
  ) then
    raise exception 'Resolution Discounts can only be issued to a completed member profile';
  end if;

  if p_discount_percent is null or p_discount_percent <= 0 or p_discount_percent > 85 then
    raise exception 'Resolution Discounts must be between 1%% and 85%%';
  end if;

  if p_expires_at is null or p_expires_at < current_date then
    raise exception 'Choose an expiration date in the future';
  end if;

  insert into public.resolution_discount_offers (
    property_id, member_id, issued_by, discount_percent, expires_at, note
  ) values (
    p_property_id, p_member_id, (select auth.uid()), round(p_discount_percent, 2), p_expires_at, nullif(btrim(p_note), '')
  ) returning * into created_offer;

  insert into public.property_conversations (property_id, guest_id, host_id)
  values (p_property_id, p_member_id, (select auth.uid()))
  on conflict (host_id, guest_id) do update set host_id = excluded.host_id
  returning id into conversation_id;

  insert into public.property_messages (conversation_id, sender_id, message_text)
  values (
    conversation_id,
    (select auth.uid()),
    format(
      'A %s%% Resolution Discount has been issued for you at %s. It will be available when you make your next reservation for this private space and can be used once through %s.%s',
      trim(to_char(created_offer.discount_percent, 'FM999990.00')),
      property_name,
      to_char(created_offer.expires_at, 'FMMonth FMDD, YYYY'),
      case when created_offer.note is null then '' else E'\n\nNote from your host: ' || created_offer.note end
    )
  );

  return created_offer;
end;
$$;

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
    raise exception 'Choose either a Courtesy Visit or a Resolution Discount for this reservation';
  end if;

  select count(*) into selected_dog_count
  from public.dog_profiles
  where dog_profiles.user_id = (select auth.uid())
    and dog_profiles.id = any(p_dog_profile_ids);

  if selected_dog_count <> cardinality(p_dog_profile_ids) then
    raise exception 'Every selected dog must belong to your dog profiles';
  end if;

  requested_hours := round(extract(epoch from (p_end_at - p_start_at)) / 3600.0, 2);
  if requested_hours < 1 then
    raise exception 'Reservations require at least one hour';
  end if;

  if p_courtesy_visit_credit_id is not null then
    select * into courtesy_credit
    from public.courtesy_visit_credits
    where id = p_courtesy_visit_credit_id
      and member_id = (select auth.uid())
      and property_id = p_property_id
      and status = 'active'
      and expires_at >= current_date
    for update;

    if courtesy_credit.id is null or courtesy_credit.remaining_hours < requested_hours then
      raise exception 'That Courtesy Visit is unavailable for this reservation';
    end if;
  end if;

  if p_resolution_discount_offer_id is not null then
    select * into discount_offer
    from public.resolution_discount_offers
    where id = p_resolution_discount_offer_id
      and member_id = (select auth.uid())
      and property_id = p_property_id
      and status = 'active'
      and expires_at >= current_date
    for update;

    if discount_offer.id is null then
      raise exception 'That Resolution Discount is unavailable for this reservation';
    end if;
  end if;

  insert into public.bookings (property_id, guest_id, start_at, end_at, dog_count)
  values (p_property_id, (select auth.uid()), p_start_at, p_end_at, selected_dog_count)
  returning * into created_booking;

  insert into public.booking_dogs (booking_id, dog_profile_id, name)
  select created_booking.id, dog_profiles.id, dog_profiles.name
  from public.dog_profiles
  where dog_profiles.user_id = (select auth.uid())
    and dog_profiles.id = any(p_dog_profile_ids);

  if courtesy_credit.id is not null then
    update public.courtesy_visit_credits
    set remaining_hours = round(remaining_hours - requested_hours, 2),
        status = case when remaining_hours - requested_hours <= 0 then 'used' else 'active' end,
        updated_at = now()
    where id = courtesy_credit.id;

    update public.bookings
    set original_total_amount = created_booking.total_amount,
        total_amount = 0,
        courtesy_visit_credit_id = courtesy_credit.id,
        courtesy_hours_applied = requested_hours,
        payment_status = 'paid',
        payment_provider = 'courtesy_visit',
        payment_updated_at = now()
    where id = created_booking.id
    returning * into created_booking;
  elsif discount_offer.id is not null then
    discounted_total := round(created_booking.total_amount * (1 - discount_offer.discount_percent / 100.0), 2);

    update public.resolution_discount_offers
    set status = 'used', updated_at = now()
    where id = discount_offer.id;

    update public.bookings
    set original_total_amount = created_booking.total_amount,
        total_amount = discounted_total,
        resolution_discount_offer_id = discount_offer.id,
        resolution_discount_percent = discount_offer.discount_percent,
        payment_provider = 'resolution_discount',
        payment_updated_at = now()
    where id = created_booking.id
    returning * into created_booking;
  end if;

  return query select created_booking.id, created_booking.total_amount, created_booking.payment_status;
end;
$$;

revoke all on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) from public, anon, authenticated;
revoke all on function public.issue_resolution_discount(uuid, uuid, numeric, date, text) from public, anon, authenticated;
revoke all on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.issue_resolution_discount(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid, uuid) to authenticated;
