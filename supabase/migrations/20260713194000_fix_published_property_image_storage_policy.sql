-- The existing policy used an unqualified `name`, which resolved to the
-- properties table name inside the subquery rather than storage.objects.name.
-- Qualify the Storage object path so published listing images can be signed
-- and shown to guests.

drop policy if exists "Members can view published property image files"
on storage.objects;

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
    where property_images.storage_path = storage.objects.name
      and properties.is_published = true
  )
);
