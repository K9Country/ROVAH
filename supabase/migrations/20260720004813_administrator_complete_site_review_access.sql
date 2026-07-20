-- Authorized administrators must be able to review every private host and
-- property detail before making a publication decision. These policies are
-- read-only and are limited to users listed in admin_users.

create policy "Administrators can view property draft details for review"
on public.property_draft_details
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Administrators can view property amenities for review"
on public.property_amenities
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Administrators can view property availability for review"
on public.property_availability
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Administrators can view date availability for review"
on public.property_date_availability
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Administrators can view property images for review"
on public.property_images
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Administrators can view property image files for review"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-images'
  and exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);
