-- Courtesy Visits are host-issued, property-specific, and valid for exactly
-- seven days.  A member may receive only one in a calendar month.
-- Existing credits are preserved only when they can comply with this policy.

alter table public.courtesy_visit_credits
  alter column expires_at type timestamptz
  using least(
    expires_at::timestamp at time zone 'America/New_York',
    created_at + interval '7 days'
  );

alter table public.courtesy_visit_credits
  drop constraint if exists courtesy_visit_credits_status_check,
  add constraint courtesy_visit_credits_status_check
    check (status in ('active', 'reserved', 'used', 'revoked', 'expired')),
  add column if not exists reserved_booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists reserved_at timestamptz;

-- Do not expose expired or duplicate legacy gifts to members. Host/admin audit
-- history remains on the original rows.
update public.courtesy_visit_credits
set status = 'expired', remaining_hours = 0, updated_at = now()
where status = 'active' and expires_at <= now();

with ranked_legacy_credits as (
  select id,
         row_number() over (partition by member_id order by created_at desc, id desc) as rank
  from public.courtesy_visit_credits
  where status = 'active' and expires_at > now()
)
update public.courtesy_visit_credits as credit
set status = 'revoked', remaining_hours = 0, updated_at = now()
from ranked_legacy_credits as ranked
where credit.id = ranked.id and ranked.rank > 1;

drop policy if exists "Members can view their courtesy visits" on public.courtesy_visit_credits;
create policy "Members can view active unexpired courtesy visits"
on public.courtesy_visit_credits
for select to authenticated
using (
  (select auth.uid()) = member_id
  and status = 'active'
  and expires_at > now()
);

create or replace function public.issue_courtesy_visit(
  p_property_id uuid,
  p_member_id uuid,
  p_hours numeric,
  p_expires_at date default null,
  p_note text default null
)
returns public.courtesy_visit_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_credit public.courtesy_visit_credits;
  local_month date := date_trunc('month', now() at time zone 'America/New_York')::date;
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = p_property_id and host_id = (select auth.uid())
  ) then
    raise exception 'Only this property''s host can issue a Courtesy Visit';
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

  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text || local_month::text, 0));

  if exists (
    select 1 from public.courtesy_visit_credits as credit
    where credit.member_id = p_member_id
      and date_trunc('month', credit.created_at at time zone 'America/New_York')::date = local_month
  ) then
    raise exception 'This member has already received a Courtesy Visit this calendar month';
  end if;

  insert into public.courtesy_visit_credits (
    property_id, member_id, issued_by, initial_hours, remaining_hours, expires_at, note
  ) values (
    p_property_id, p_member_id, (select auth.uid()), round(p_hours, 2), round(p_hours, 2),
    now() + interval '7 days', nullif(btrim(p_note), '')
  ) returning * into created_credit;

  return created_credit;
end;
$$;

create or replace function public.get_courtesy_visit_eligibility(
  p_scheduled_start_at timestamptz
)
returns table (eligible boolean, next_eligible_date date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required';
  end if;

  return query select true, null::date;
end;
$$;

drop trigger if exists enforce_courtesy_visit_frequency on public.bookings;

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
  scheduled_month date := date_trunc('month', p_start_at at time zone 'America/New_York')::date;
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required to create a reservation';
  end if;
  if coalesce(cardinality(p_dog_profile_ids), 0) = 0 then raise exception 'Select at least one dog for this reservation'; end if;
  if p_courtesy_visit_credit_id is not null and p_resolution_discount_offer_id is not null then raise exception 'Choose either a Courtesy Visit or a Special Discount for this reservation'; end if;

  select count(*) into selected_dog_count from public.dog_profiles as dog
  where dog.user_id = (select auth.uid()) and dog.id = any(p_dog_profile_ids);
  if selected_dog_count <> cardinality(p_dog_profile_ids) then raise exception 'Every selected dog must belong to your dog profiles'; end if;

  requested_hours := round(extract(epoch from (p_end_at - p_start_at)) / 3600.0, 2);
  if requested_hours < 1 then raise exception 'Reservations require at least one hour'; end if;

  if p_courtesy_visit_credit_id is not null then
    select * into courtesy_credit from public.courtesy_visit_credits as credit
    where credit.id = p_courtesy_visit_credit_id and credit.member_id = (select auth.uid())
      and credit.property_id = p_property_id and credit.status = 'active'
      and credit.expires_at > now() and credit.remaining_hours >= requested_hours
    for update;
    if courtesy_credit.id is null then raise exception 'That Courtesy Visit is unavailable for this reservation'; end if;
    if exists (select 1 from public.bookings as booking where booking.guest_id = (select auth.uid())
      and booking.payment_provider = 'courtesy_visit' and booking.status in ('confirmed', 'completed')
      and date_trunc('month', booking.start_at at time zone 'America/New_York')::date = scheduled_month) then
      raise exception 'Only one Courtesy Visit can be used per calendar month';
    end if;
  end if;

  if p_resolution_discount_offer_id is not null then
    select * into discount_offer from public.resolution_discount_offers as offer
    where offer.id = p_resolution_discount_offer_id and offer.member_id = (select auth.uid())
      and offer.property_id = p_property_id and offer.status = 'active' and offer.expires_at >= current_date
    for update;
    if discount_offer.id is null then raise exception 'That Special Discount is unavailable for this reservation'; end if;
  end if;

  insert into public.bookings (property_id, guest_id, start_at, end_at, dog_count)
  values (p_property_id, (select auth.uid()), p_start_at, p_end_at, selected_dog_count)
  returning * into created_booking;
  insert into public.booking_dogs (booking_id, dog_profile_id, name)
  select created_booking.id, dog.id, dog.name from public.dog_profiles as dog
  where dog.user_id = (select auth.uid()) and dog.id = any(p_dog_profile_ids);

  if courtesy_credit.id is not null then
    update public.courtesy_visit_credits as credit
    set status = 'reserved', reserved_booking_id = created_booking.id, reserved_at = now(), updated_at = now()
    where credit.id = courtesy_credit.id;
    update public.bookings as booking set original_total_amount = created_booking.total_amount,
      total_amount = 0, status = 'confirmed', courtesy_visit_credit_id = courtesy_credit.id,
      courtesy_hours_applied = requested_hours, payment_status = 'paid', payment_provider = 'courtesy_visit', payment_updated_at = now()
    where booking.id = created_booking.id returning * into created_booking;
  elsif discount_offer.id is not null then
    discounted_total := round(created_booking.total_amount * (1 - discount_offer.discount_percent / 100.0), 2);
    update public.resolution_discount_offers as offer set status = 'used', updated_at = now() where offer.id = discount_offer.id;
    update public.bookings as booking set original_total_amount = created_booking.total_amount,
      total_amount = discounted_total, resolution_discount_offer_id = discount_offer.id,
      resolution_discount_percent = discount_offer.discount_percent, payment_provider = 'resolution_discount', payment_updated_at = now()
    where booking.id = created_booking.id returning * into created_booking;
  end if;
  return query select created_booking.id, created_booking.total_amount, created_booking.payment_status;
end;
$$;

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('confirmed', 'completed', 'cancelled'));

create or replace function public.finalize_or_release_courtesy_visit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payment_provider <> 'courtesy_visit' or new.courtesy_visit_credit_id is null then return new; end if;
  if new.status = 'completed' then
    update public.courtesy_visit_credits set status = 'used', remaining_hours = 0, updated_at = now()
    where id = new.courtesy_visit_credit_id and reserved_booking_id = new.id;
  elsif new.status = 'cancelled' then
    update public.courtesy_visit_credits set status = case when expires_at > now() then 'active' else 'expired' end,
      reserved_booking_id = null, reserved_at = null, updated_at = now()
    where id = new.courtesy_visit_credit_id and reserved_booking_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists finalize_or_release_courtesy_visit on public.bookings;
create trigger finalize_or_release_courtesy_visit after update of status on public.bookings
for each row execute function public.finalize_or_release_courtesy_visit();

revoke all on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) from public, anon, authenticated;
grant execute on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid, uuid) to authenticated;
