-- Supabase Storage blocks direct SQL deletes from storage.objects. Profile
-- image cleanup is handled through the supported Storage API by the app.
drop trigger if exists delete_guest_profile_image_before_profile_delete on public.guest_profiles;
drop function if exists private.delete_guest_profile_image_on_profile_delete();
