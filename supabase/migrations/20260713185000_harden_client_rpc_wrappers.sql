-- Keep privileged logic out of the Data API's exposed schema. The public
-- wrappers run as the caller and only delegate to these authenticated-only
-- internal functions.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.mark_property_conversation_read_internal(
  target_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.property_conversations
  set
    guest_last_read_at = case
      when guest_id = (select auth.uid()) then now()
      else guest_last_read_at
    end,
    host_last_read_at = case
      when host_id = (select auth.uid()) then now()
      else host_last_read_at
    end
  where id = target_conversation_id
    and (
      guest_id = (select auth.uid())
      or host_id = (select auth.uid())
    );
end;
$$;

create or replace function private.record_property_view_internal(
  target_property_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;

  update public.properties
  set view_count = view_count + 1
  where id = target_property_id
    and is_published = true
    and host_id is distinct from (select auth.uid());
end;
$$;

revoke all on function private.mark_property_conversation_read_internal(uuid) from public, anon;
revoke all on function private.record_property_view_internal(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.mark_property_conversation_read_internal(uuid) to authenticated;
grant execute on function private.record_property_view_internal(uuid) to authenticated;

create or replace function public.mark_property_conversation_read(
  target_conversation_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  perform private.mark_property_conversation_read_internal(target_conversation_id);
end;
$$;

create or replace function public.record_property_view(
  target_property_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  perform private.record_property_view_internal(target_property_id);
end;
$$;

revoke all on function public.mark_property_conversation_read(uuid) from public, anon;
revoke all on function public.record_property_view(uuid) from public, anon;
grant execute on function public.mark_property_conversation_read(uuid) to authenticated;
grant execute on function public.record_property_view(uuid) to authenticated;
