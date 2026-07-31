-- Private, host-issued free visit credits. A credit is always limited to one
-- member and one property, and can only be redeemed through the booking RPC.

create table if not exists public.courtesy_visit_credits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  issued_by uuid not null references auth.users(id) on delete restrict,
  initial_hours numeric(6, 2) not null check (initial_hours > 0 and initial_hours <= 100),
  remaining_hours numeric(6, 2) not null check (remaining_hours >= 0 and remaining_hours <= initial_hours),
  expires_at date not null,
  note text check (note is null or char_length(btrim(note)) <= 280),
  status text not null default 'active' check (status in ('active', 'used', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courtesy_visit_credits_member_property_idx
  on public.courtesy_visit_credits (member_id, property_id, status, expires_at);

alter table public.courtesy_visit_credits enable row level security;
revoke all on table public.courtesy_visit_credits from anon, authenticated;
grant select on table public.courtesy_visit_credits to authenticated;

create policy "Members can view their courtesy visits"
on public.courtesy_visit_credits
for select to authenticated
using ((select auth.uid()) = member_id);

create policy "Hosts can view courtesy visits for their properties"
on public.courtesy_visit_credits
for select to authenticated
using (
  exists (
    select 1 from public.properties
    where properties.id = courtesy_visit_credits.property_id
      and properties.host_id = (select auth.uid())
  )
);

alter table public.bookings
  add column if not exists courtesy_visit_credit_id uuid references public.courtesy_visit_credits(id) on delete set null,
  add column if not exists courtesy_hours_applied numeric(6, 2) not null default 0 check (courtesy_hours_applied >= 0);

create index if not exists bookings_courtesy_visit_credit_idx
  on public.bookings (courtesy_visit_credit_id);

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
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = p_property_id and host_id = (select auth.uid())
  ) then
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

  return created_credit;
end;
$$;

create or replace function public.revoke_courtesy_visit(p_credit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.courtesy_visit_credits
    join public.properties on properties.id = courtesy_visit_credits.property_id
    where courtesy_visit_credits.id = p_credit_id
      and properties.host_id = (select auth.uid())
      and courtesy_visit_credits.status = 'active'
  ) then
    raise exception 'This active Courtesy Visit could not be found';
  end if;

  update public.courtesy_visit_credits
  set status = 'revoked', remaining_hours = 0, updated_at = now()
  where id = p_credit_id;
end;
$$;

create or replace function public.create_booking_with_dogs(
  p_property_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_dog_profile_ids uuid[],
  p_courtesy_visit_credit_id uuid default null
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
  requested_hours numeric(6, 2);
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required to create a reservation';
  end if;

  if coalesce(cardinality(p_dog_profile_ids), 0) = 0 then
    raise exception 'Select at least one dog for this reservation';
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
    raise exception 'Courtesy Visits require at least one hour';
  end if;

  if p_courtesy_visit_credit_id is not null then
    select * into courtesy_credit
    from public.courtesy_visit_credits
    where courtesy_visit_credits.id = p_courtesy_visit_credit_id
      and courtesy_visit_credits.member_id = (select auth.uid())
      and courtesy_visit_credits.property_id = p_property_id
      and courtesy_visit_credits.status = 'active'
      and courtesy_visit_credits.expires_at >= current_date
    for update;

    if courtesy_credit.id is null then
      raise exception 'That Courtesy Visit is unavailable for this reservation';
    end if;

    if courtesy_credit.remaining_hours < requested_hours then
      raise exception 'This Courtesy Visit does not have enough remaining hours';
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

  if p_courtesy_visit_credit_id is not null then
    update public.courtesy_visit_credits
    set remaining_hours = round(remaining_hours - requested_hours, 2),
        status = case when remaining_hours - requested_hours <= 0 then 'used' else 'active' end,
        updated_at = now()
    where id = courtesy_credit.id;

    update public.bookings
    set total_amount = 0,
        courtesy_visit_credit_id = courtesy_credit.id,
        courtesy_hours_applied = requested_hours,
        payment_status = 'paid',
        payment_provider = 'courtesy_visit',
        payment_updated_at = now()
    where bookings.id = created_booking.id
    returning * into created_booking;
  end if;

  return query select created_booking.id, created_booking.total_amount, created_booking.payment_status;
end;
$$;

revoke all on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) from public, anon, authenticated;
revoke all on function public.revoke_courtesy_visit(uuid) from public, anon, authenticated;
revoke all on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.revoke_courtesy_visit(uuid) to authenticated;
grant execute on function public.create_booking_with_dogs(uuid, timestamptz, timestamptz, uuid[], uuid) to authenticated;
