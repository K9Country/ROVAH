create table public.booking_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in ('guest_to_host', 'host_to_guest')),
  bone_rating smallint not null check (bone_rating between 1 and 5),
  review_text text not null default '' check (char_length(trim(review_text)) <= 500),
  created_at timestamptz not null default now(),
  unique (booking_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create index booking_reviews_reviewee_created_at_idx
  on public.booking_reviews (reviewee_id, created_at desc);

create index booking_reviews_booking_id_idx
  on public.booking_reviews (booking_id);

alter table public.booking_reviews enable row level security;

grant select, insert on public.booking_reviews to authenticated;

create policy "Review participants can read their reviews"
on public.booking_reviews
for select
to authenticated
using (
  reviewer_id = (select auth.uid())
  or reviewee_id = (select auth.uid())
  or (
    review_type = 'guest_to_host'
    and exists (
      select 1 from public.guest_profiles
      where user_id = (select auth.uid())
        and profile_completed_at is not null
    )
  )
  or (
    review_type = 'host_to_guest'
    and exists (
      select 1 from public.host_profiles
      where user_id = (select auth.uid())
        and onboarding_completed_at is not null
        and status = 'active'
    )
  )
);

create policy "Guests can review hosts after completed visits"
on public.booking_reviews
for insert
to authenticated
with check (
  reviewer_id = (select auth.uid())
  and review_type = 'guest_to_host'
  and exists (
    select 1
    from public.bookings b
    join public.properties p on p.id = b.property_id
    where b.id = booking_id
      and b.guest_id = (select auth.uid())
      and p.host_id = reviewee_id
      and b.status = 'confirmed'
      and b.end_at <= now()
  )
);

create policy "Hosts can review guests after completed visits"
on public.booking_reviews
for insert
to authenticated
with check (
  reviewer_id = (select auth.uid())
  and review_type = 'host_to_guest'
  and exists (
    select 1
    from public.bookings b
    join public.properties p on p.id = b.property_id
    where b.id = booking_id
      and p.host_id = (select auth.uid())
      and b.guest_id = reviewee_id
      and b.status = 'confirmed'
      and b.end_at <= now()
  )
);
