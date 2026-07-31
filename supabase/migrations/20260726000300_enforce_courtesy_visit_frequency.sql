-- A member may schedule only one Courtesy Visit in any rolling seven-day window.
-- Cancelled or failed reservations do not count toward the limit.
create or replace function public.get_courtesy_visit_eligibility(
  p_scheduled_start_at timestamptz
)
returns table (eligible boolean, next_eligible_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflicting_visit_date date;
  scheduled_visit_date date := p_scheduled_start_at::date;
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent member account is required';
  end if;

  select booking.start_at::date into conflicting_visit_date
  from public.bookings as booking
  where booking.guest_id = (select auth.uid())
    and booking.payment_provider = 'courtesy_visit'
    and booking.status in ('confirmed', 'completed')
    and booking.start_at::date between scheduled_visit_date - 6 and scheduled_visit_date + 6
  order by booking.start_at desc
  limit 1;

  return query
  select conflicting_visit_date is null,
         case when conflicting_visit_date is null then null else conflicting_visit_date + 7 end;
end;
$$;

create or replace function public.enforce_courtesy_visit_frequency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  conflicting_visit_date date;
begin
  if new.payment_provider <> 'courtesy_visit'
    or new.status not in ('confirmed', 'completed') then
    return new;
  end if;

  select booking.start_at::date into conflicting_visit_date
  from public.bookings as booking
  where booking.guest_id = new.guest_id
    and booking.id <> new.id
    and booking.payment_provider = 'courtesy_visit'
    and booking.status in ('confirmed', 'completed')
    and booking.start_at::date between new.start_at::date - 6 and new.start_at::date + 6
  order by booking.start_at desc
  limit 1;

  if conflicting_visit_date is not null then
    raise exception 'One Courtesy Visit every 7 days. Your next Courtesy Visit can be scheduled for %.',
      to_char(conflicting_visit_date + 7, 'FMMonth FMDD, YYYY');
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_courtesy_visit_frequency on public.bookings;
create trigger enforce_courtesy_visit_frequency
before insert or update of payment_provider, status, start_at on public.bookings
for each row execute function public.enforce_courtesy_visit_frequency();

revoke all on function public.get_courtesy_visit_eligibility(timestamptz) from public, anon, authenticated;
grant execute on function public.get_courtesy_visit_eligibility(timestamptz) to authenticated;
revoke all on function public.enforce_courtesy_visit_frequency() from public, anon, authenticated;
