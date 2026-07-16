-- Let signed-in members view the public information needed for a published listing.
-- Host management policies remain in place and continue to govern writes.

create policy "Members can view published property details"
on public.property_draft_details
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_draft_details.property_id
      and properties.is_published = true
  )
);

create policy "Members can view published property amenities"
on public.property_amenities
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_amenities.property_id
      and properties.is_published = true
  )
);

create policy "Members can view published property availability"
on public.property_availability
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_availability.property_id
      and properties.is_published = true
  )
);

create policy "Members can view published property images"
on public.property_images
for select
to authenticated
using (
  exists (
    select 1
    from public.properties
    where properties.id = property_images.property_id
      and properties.is_published = true
  )
);

create policy "Members can view published property image files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-images'
  and exists (
    select 1
    from public.property_images
    join public.properties on properties.id = property_images.property_id
    where property_images.storage_path = name
      and properties.is_published = true
  )
);
