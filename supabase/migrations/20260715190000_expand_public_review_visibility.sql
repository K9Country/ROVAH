drop policy if exists "Review participants and members can read public reviews" on public.booking_reviews;

create policy "Review participants and members can read public reviews"
on public.booking_reviews
for select
to authenticated
using (
  reviewer_id = (select auth.uid())
  or reviewee_id = (select auth.uid())
  or (
    comment_visibility = 'public'
    and (
      exists (
        select 1
        from public.guest_profiles
        where user_id = (select auth.uid())
          and profile_completed_at is not null
      )
      or exists (
        select 1
        from public.host_profiles
        where user_id = (select auth.uid())
          and onboarding_completed_at is not null
          and status = 'active'
      )
    )
  )
);
