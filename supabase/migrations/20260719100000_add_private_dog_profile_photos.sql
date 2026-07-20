alter table public.dog_profiles
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dog-profile-images',
  'dog-profile-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Members can view their own dog profile images" on storage.objects;
drop policy if exists "Members can upload their own dog profile images" on storage.objects;
drop policy if exists "Members can update their own dog profile images" on storage.objects;
drop policy if exists "Members can delete their own dog profile images" on storage.objects;

create policy "Members can view their own dog profile images"
on storage.objects for select to authenticated
using (
  bucket_id = 'dog-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members can upload their own dog profile images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dog-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members can update their own dog profile images"
on storage.objects for update to authenticated
using (
  bucket_id = 'dog-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'dog-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members can delete their own dog profile images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dog-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
