-- Hosts need the same operational ability as guests to cancel an upcoming
-- reservation at a site they manage. Column privileges already restrict every
-- client-side update to the booking status only.

create policy "Hosts can cancel upcoming bookings for their properties"
on public.bookings
for update
to authenticated
using (
  status = 'confirmed'
  and start_at > now()
  and exists (
    select 1
    from public.properties
    where properties.id = bookings.property_id
      and properties.host_id = (select auth.uid())
  )
)
with check (
  status = 'cancelled'
  and exists (
    select 1
    from public.properties
    where properties.id = bookings.property_id
      and properties.host_id = (select auth.uid())
  )
);
