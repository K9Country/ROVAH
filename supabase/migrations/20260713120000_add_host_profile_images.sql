alter table public.host_profiles
  add column if not exists profile_image_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'host-profile-images',
  'host-profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Hosts upload their own profile images" on storage.objects;
drop policy if exists "Hosts view their own profile images" on storage.objects;
drop policy if exists "Hosts update their own profile images" on storage.objects;
drop policy if exists "Hosts delete their own profile images" on storage.objects;

create policy "Hosts upload their own profile images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'host-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Hosts view their own profile images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'host-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Hosts update their own profile images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'host-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'host-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Hosts delete their own profile images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'host-profile-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

grant update (profile_image_path)
on public.host_profiles
to authenticated;
