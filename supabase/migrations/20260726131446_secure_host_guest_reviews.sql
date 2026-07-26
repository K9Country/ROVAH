-- Host-to-guest reviews are professional, host-only records tied to one
-- completed reservation.  They are never visible to members/guests.

drop policy if exists "Guests can review hosts after completed visits" on public.booking_reviews;
drop policy if exists "Hosts can review guests after completed visits" on public.booking_reviews;
drop policy if exists "Review participants and members can read public reviews" on public.booking_reviews;

create policy "Guests can review completed property visits"
on public.booking_reviews
for insert
to authenticated
with check (
  reviewer_id = (select auth.uid())
  and review_type = 'guest_to_host'
  and comment_visibility = 'public'
  and exists (
    select 1
    from public.bookings as booking
    join public.properties as property on property.id = booking.property_id
    where booking.id = booking_reviews.booking_id
      and booking.property_id = booking_reviews.property_id
      and booking.guest_id = (select auth.uid())
      and property.host_id = booking_reviews.reviewee_id
      and booking.status = 'confirmed'
      and booking.end_at <= now()
  )
);

create policy "Hosts can review guests after completed visits"
on public.booking_reviews
for insert
to authenticated
with check (
  reviewer_id = (select auth.uid())
  and review_type = 'host_to_guest'
  and comment_visibility = 'private'
  and exists (
    select 1
    from public.host_profiles as host
    where host.user_id = (select auth.uid())
      and host.onboarding_completed_at is not null
      and host.status = 'active'
  )
  and exists (
    select 1
    from public.bookings as booking
    join public.properties as property on property.id = booking.property_id
    where booking.id = booking_reviews.booking_id
      and booking.property_id = booking_reviews.property_id
      and property.host_id = (select auth.uid())
      and booking.guest_id = booking_reviews.reviewee_id
      and booking.status = 'confirmed'
      and booking.end_at <= now()
  )
);

create policy "Authorized users can read the appropriate reviews"
on public.booking_reviews
for select
to authenticated
using (
  (
    review_type = 'guest_to_host'
    and (
      reviewer_id = (select auth.uid())
      or reviewee_id = (select auth.uid())
      or (
        comment_visibility = 'public'
        and exists (
          select 1
          from public.guest_profiles as guest
          where guest.user_id = (select auth.uid())
            and guest.profile_completed_at is not null
        )
      )
    )
  )
  or (
    review_type = 'host_to_guest'
    and exists (
      select 1
      from public.host_profiles as host
      where host.user_id = (select auth.uid())
        and host.onboarding_completed_at is not null
        and host.status = 'active'
    )
  )
);
