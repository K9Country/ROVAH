-- Guests may read only the private feedback written about their own completed visits.
-- The view timestamp drives the dashboard's "New" alert without exposing feedback publicly.

alter table public.booking_reviews
  add column if not exists guest_feedback_viewed_at timestamptz;

drop policy if exists "Authorized users can read the appropriate reviews" on public.booking_reviews;

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
      and (
        reviewee_id = (select auth.uid())
        or reviewer_id = (select auth.uid())
      )
    )
  )
);

create or replace function public.mark_host_feedback_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.booking_reviews
  set guest_feedback_viewed_at = now()
  where review_type = 'host_to_guest'
    and reviewee_id = auth.uid()
    and guest_feedback_viewed_at is null;
$$;

revoke all on function public.mark_host_feedback_read() from public;
revoke all on function public.mark_host_feedback_read() from anon;
grant execute on function public.mark_host_feedback_read() to authenticated;
