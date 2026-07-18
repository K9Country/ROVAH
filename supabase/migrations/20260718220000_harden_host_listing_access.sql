-- Keep public property browsing available while preventing temporary anonymous
-- sessions from creating or changing hosting records.
create policy "Permanent users only for host profiles"
on public.host_profiles
as restrictive
for all
to authenticated
using (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
)
with check (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

create policy "Permanent users only for property creation"
on public.properties
as restrictive
for insert
to authenticated
with check (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

create policy "Permanent users only for property updates"
on public.properties
as restrictive
for update
to authenticated
using (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
)
with check (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

create policy "Permanent users only for property deletion"
on public.properties
as restrictive
for delete
to authenticated
using (
  coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
);

-- Keep extension objects out of the public API schema.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;
