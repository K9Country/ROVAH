-- Anonymous visitors can browse and message, but a permanent member account is
-- required for any reservation action.

drop policy if exists "Members can create their own bookings" on public.bookings;
drop policy if exists "Members can view their own bookings" on public.bookings;
drop policy if exists "Hosts can view bookings for their properties" on public.bookings;
drop policy if exists "Members can cancel their own upcoming bookings" on public.bookings;

create policy "Members can create their own bookings"
on public.bookings
for insert
to authenticated
with check (
  guest_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Members can view their own bookings"
on public.bookings
for select
to authenticated
using (
  guest_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Hosts can view bookings for their properties"
on public.bookings
for select
to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and exists (
    select 1
    from public.properties
    where properties.id = bookings.property_id
      and properties.host_id = (select auth.uid())
  )
);

create policy "Members can cancel their own upcoming bookings"
on public.bookings
for update
to authenticated
using (
  guest_id = (select auth.uid())
  and status = 'confirmed'
  and start_at >= now() + interval '1 hour'
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
)
with check (
  guest_id = (select auth.uid())
  and status = 'cancelled'
  and start_at >= now() + interval '1 hour'
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);
