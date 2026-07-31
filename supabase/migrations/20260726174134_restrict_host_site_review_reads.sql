-- Public site reviews remain available to completed member accounts, while a
-- host account can read only reviews for its own properties. This prevents a
-- host from using the client API to browse another host's guest feedback.
drop policy if exists "Authorized users can read the appropriate reviews" on public.booking_reviews;

create policy "Authorized users can read the appropriate reviews"
on public.booking_reviews
for select
to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  and (
    exists (
      select 1
      from public.admin_users admin
      where admin.user_id = (select auth.uid())
    )
    or (
      review_type = 'guest_to_host'
      and (
        reviewer_id = (select auth.uid())
        or reviewee_id = (select auth.uid())
        or (
          comment_visibility = 'public'
          and exists (
            select 1
            from public.guest_profiles guest
            where guest.user_id = (select auth.uid())
              and guest.profile_completed_at is not null
          )
          and not exists (
            select 1
            from public.host_profiles host
            where host.user_id = (select auth.uid())
          )
        )
      )
    )
    or (
      review_type = 'host_to_guest'
      and (
        reviewee_id = (select auth.uid())
        or reviewer_id = (select auth.uid())
      )
    )
  )
);
