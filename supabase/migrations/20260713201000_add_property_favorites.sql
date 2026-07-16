-- K9 Country member favorites
create table public.property_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, property_id)
);

create index property_favorites_user_id_created_at_index
  on public.property_favorites (user_id, created_at desc);

create index property_favorites_property_id_index
  on public.property_favorites (property_id);

alter table public.property_favorites enable row level security;

revoke all on table public.property_favorites from anon;
grant select, insert, delete on table public.property_favorites to authenticated;
grant all on table public.property_favorites to service_role;

create policy "Members can view their own favorites"
on public.property_favorites
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "Members can save their own favorites"
on public.property_favorites
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

create policy "Members can remove their own favorites"
on public.property_favorites
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);
