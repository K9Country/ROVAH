-- A guest may retain their authentication account after deleting their profile,
-- but their private profile photo must be removed with the profile record.
create or replace function private.delete_guest_profile_image_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = storage, public
as $$
begin
  if old.profile_image_path is not null then
    delete from storage.objects
    where bucket_id = 'guest-profile-images'
      and name = old.profile_image_path;
  end if;

  return old;
end;
$$;

revoke all on function private.delete_guest_profile_image_on_profile_delete() from public, anon, authenticated;

drop trigger if exists delete_guest_profile_image_before_profile_delete on public.guest_profiles;
create trigger delete_guest_profile_image_before_profile_delete
before delete on public.guest_profiles
for each row
execute function private.delete_guest_profile_image_on_profile_delete();
