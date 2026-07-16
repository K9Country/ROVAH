alter table public.guest_profiles
  add column if not exists profile_image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-profile-images', 'guest-profile-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Guests upload their own profile images" on storage.objects for insert to authenticated
with check (bucket_id = 'guest-profile-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Guests update their own profile images" on storage.objects for update to authenticated
using (bucket_id = 'guest-profile-images' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'guest-profile-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
grant update (profile_image_path) on public.guest_profiles to authenticated;
