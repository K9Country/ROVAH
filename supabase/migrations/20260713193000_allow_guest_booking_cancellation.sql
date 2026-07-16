-- Guests may cancel only their own confirmed reservation while at least one
-- hour remains. Column-level access prevents changes to pricing, dates, or
-- any other booking details from the client.

grant update (status) on table public.bookings to authenticated;

create policy "Members can cancel their own upcoming bookings"
on public.bookings
for update
to authenticated
using (
  guest_id = (select auth.uid())
  and status = 'confirmed'
  and start_at >= now() + interval '1 hour'
)
with check (
  guest_id = (select auth.uid())
  and status = 'cancelled'
  and start_at >= now() + interval '1 hour'
);
