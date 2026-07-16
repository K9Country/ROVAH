alter table public.booking_reviews
  add column comment_visibility text not null default 'public'
    check (comment_visibility in ('public', 'private')),
  add column fence_security text not null default 'not_sure'
    check (fence_security in ('yes', 'no', 'not_sure')),
  add column cleanliness text not null default 'not_sure'
    check (cleanliness in ('yes', 'no', 'not_sure')),
  add column nearby_distractions text[] not null default '{}',
  add column unexpected_encounters text not null default ''
    check (char_length(trim(unexpected_encounters)) <= 500),
  add column photo_urls text[] not null default '{}';

drop policy "Review participants can read their reviews" on public.booking_reviews;

create policy "Review participants and members can read public reviews"
on public.booking_reviews
for select
to authenticated
using (
  reviewer_id = (select auth.uid())
  or reviewee_id = (select auth.uid())
  or (
    comment_visibility = 'public'
    and review_type = 'guest_to_host'
    and exists (
      select 1 from public.guest_profiles
      where user_id = (select auth.uid()) and profile_completed_at is not null
    )
  )
  or (
    comment_visibility = 'public'
    and review_type = 'host_to_guest'
    and exists (
      select 1 from public.host_profiles
      where user_id = (select auth.uid()) and onboarding_completed_at is not null and status = 'active'
    )
  )
);

insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

create policy "Reviewers can upload their review photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
