-- K9 Country administrator site-review workflow.
-- The initial administrator is the K9 Country owner account.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

drop policy if exists "Administrators can view their own role" on public.admin_users;
create policy "Administrators can view their own role"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.admin_users from anon;
revoke all on table public.admin_users from authenticated;
grant select on table public.admin_users to authenticated;
grant all on table public.admin_users to service_role;

insert into public.admin_users (user_id)
values ('9c01669d-e953-4b56-8255-cd63917ef1bf')
on conflict (user_id) do nothing;

alter table public.properties
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'declined')),
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

update public.properties
set approval_status = case when is_published then 'approved' else 'pending' end
where approval_status = 'pending';

create index if not exists properties_approval_status_index
  on public.properties (approval_status, created_at desc);

drop policy if exists "Administrators can review all properties" on public.properties;
create policy "Administrators can review all properties"
on public.properties
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Administrators can decide property approvals" on public.properties;
create policy "Administrators can decide property approvals"
on public.properties
for update
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "Administrators can view host profiles" on public.host_profiles;
create policy "Administrators can view host profiles"
on public.host_profiles
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);
