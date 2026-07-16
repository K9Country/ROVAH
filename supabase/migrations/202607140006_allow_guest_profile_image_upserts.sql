-- Storage upserts require SELECT in addition to INSERT and UPDATE.
-- Guests may only read the object stored in their own profile-image folder.
create policy "Guests read their own profile images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'guest-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
