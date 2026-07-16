-- A single aggregate avoids storing unnecessary guest browsing history.
alter table public.properties
  add column if not exists view_count integer not null default 0
  check (view_count >= 0);

-- Record a view only for an authenticated member looking at another host's
-- published property. The function has no return data and cannot be called
-- anonymously.
create or replace function public.record_property_view(
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

revoke all on function public.record_property_view(uuid) from public;
grant execute on function public.record_property_view(uuid) to authenticated;
