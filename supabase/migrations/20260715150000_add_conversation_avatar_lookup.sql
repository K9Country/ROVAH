-- Profile records include private contact information. This only reveals an
-- existing conversation counterpart's avatar storage location.
create or replace function private.get_conversation_profile_images_internal(
  target_user_ids uuid[]
)
returns table (
  user_id uuid,
  bucket_id text,
  profile_image_path text
)
language sql
security definer
set search_path = public
as $$
  select
    host_profile.user_id,
    'host-profile-images'::text as bucket_id,
    host_profile.profile_image_path
  from public.host_profiles as host_profile
  where host_profile.user_id = any(target_user_ids)
    and host_profile.profile_image_path is not null
    and exists (
      select 1
      from public.property_conversations as conversation
      where conversation.host_id = host_profile.user_id
        and conversation.guest_id = (select auth.uid())
    )

  union all

  select
    guest_profile.user_id,
    'guest-profile-images'::text as bucket_id,
    guest_profile.profile_image_path
  from public.guest_profiles as guest_profile
  where guest_profile.user_id = any(target_user_ids)
    and guest_profile.profile_image_path is not null
    and exists (
      select 1
      from public.property_conversations as conversation
      where conversation.guest_id = guest_profile.user_id
        and conversation.host_id = (select auth.uid())
    );
$$;

revoke all on function private.get_conversation_profile_images_internal(uuid[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.get_conversation_profile_images_internal(uuid[]) to authenticated;

create or replace function public.get_conversation_profile_images(
  target_user_ids uuid[]
)
returns table (
  user_id uuid,
  bucket_id text,
  profile_image_path text
)
language sql
security invoker
set search_path = public, private
as $$
  select *
  from private.get_conversation_profile_images_internal(target_user_ids);
$$;

revoke all on function public.get_conversation_profile_images(uuid[]) from public, anon;
grant execute on function public.get_conversation_profile_images(uuid[]) to authenticated;
