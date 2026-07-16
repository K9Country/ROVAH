alter table public.booking_reviews
  add column property_id uuid references public.properties(id) on delete cascade;

update public.booking_reviews review
set property_id = booking.property_id
from public.bookings booking
where booking.id = review.booking_id
  and review.property_id is null;

alter table public.booking_reviews
  alter column property_id set not null;

create index booking_reviews_property_created_at_idx
  on public.booking_reviews (property_id, created_at desc);
