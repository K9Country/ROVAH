-- A host can be in the final stages of onboarding while already managing an
-- approved property. Property ownership is the authorization boundary for
-- writing a review; a host profile is sufficient to read host-only history.

drop policy if exists "Hosts can review guests after completed visits" on public.booking_reviews;
drop policy if exists "Authorized users can read the appropriate reviews" on public.booking_reviews;

create policy "Hosts can review guests after completed visits"
on public.booking_reviews
for insert
to authenticated
with check (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and reviewer_id = (select auth.uid())
  and review_type = 'host_to_guest'
  and comment_visibility = 'private'
  and exists (
    select 1
    from public.host_profiles as host
    where host.user_id = (select auth.uid())
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
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and (
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
      )
    )
  )
);
