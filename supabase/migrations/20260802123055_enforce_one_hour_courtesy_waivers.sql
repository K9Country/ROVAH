-- Courtesy Waivers are a simple, platform-wide goodwill benefit: exactly one
-- free hour that includes every dog selected by the member. A member may only
-- receive one waiver during any rolling seven-day period.

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
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = p_property_id and host_id = (select auth.uid())
  ) then
    raise exception 'Only this property''s host can issue a Courtesy Waiver';
  end if;

  if not exists (
    select 1 from public.guest_profiles
    where user_id = p_member_id and profile_completed_at is not null
  ) then
    raise exception 'Courtesy Waivers can only be issued to a completed member profile';
  end if;

  if p_hours is distinct from 1 then
    raise exception 'A Courtesy Waiver always covers exactly one hour';
  end if;

  -- Serialize issuance for this member across every host and property.
  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));

  if exists (
    select 1
    from public.courtesy_visit_credits as credit
    where credit.member_id = p_member_id
      and credit.created_at > now() - interval '7 days'
  ) then
    raise exception 'This member has already received a Courtesy Waiver within the last seven days';
  end if;

  insert into public.courtesy_visit_credits (
    property_id, member_id, issued_by, initial_hours, remaining_hours, expires_at, note
  ) values (
    p_property_id, p_member_id, (select auth.uid()), 1, 1,
    now() + interval '7 days', nullif(btrim(p_note), '')
  ) returning * into created_credit;

  return created_credit;
end;
$$;

-- This trigger protects the rule inside every booking path, including direct
-- RPC callers. The selected dogs are already validated by the booking RPC and
-- the $0 courtesy booking includes all of them without an additional-dog fee.
create or replace function public.enforce_courtesy_waiver_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.courtesy_visit_credit_id is not null then
    if new.end_at <> new.start_at + interval '1 hour' then
      raise exception 'A Courtesy Waiver can only be used for exactly one hour';
    end if;
    if new.courtesy_hours_applied <> 1 then
      raise exception 'A Courtesy Waiver always applies exactly one hour';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_courtesy_waiver_booking on public.bookings;
create trigger enforce_courtesy_waiver_booking
before insert or update of courtesy_visit_credit_id, courtesy_hours_applied, start_at, end_at
on public.bookings
for each row execute function public.enforce_courtesy_waiver_booking();

revoke all on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) from public, anon, authenticated;
grant execute on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.enforce_courtesy_waiver_booking() from public, anon, authenticated;
