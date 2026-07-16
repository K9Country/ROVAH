-- Private, per-guest photo storage for memories from site visits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-memories',
  'guest-memories',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

create policy "Guests view their own memories"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'guest-memories'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Guests upload their own memories"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'guest-memories'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
