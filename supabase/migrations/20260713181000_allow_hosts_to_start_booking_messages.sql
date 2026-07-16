-- Hosts may initiate a conversation only for a guest with a confirmed booking
-- at that exact property.
create policy "Hosts can start a conversation for a confirmed booking"
on public.property_conversations
for insert
to authenticated
with check (
  host_id = (select auth.uid())
  and exists (
    select 1
    from public.bookings
    join public.properties on properties.id = bookings.property_id
    where bookings.property_id = property_conversations.property_id
      and bookings.guest_id = property_conversations.guest_id
      and bookings.status = 'confirmed'
      and properties.host_id = (select auth.uid())
  )
);
