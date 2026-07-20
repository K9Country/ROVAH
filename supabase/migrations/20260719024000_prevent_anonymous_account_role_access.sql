drop policy if exists "Users can read their own account role" on public.account_roles;
drop policy if exists "Users can choose their account role once" on public.account_roles;

create policy "Users can read their own account role"
on public.account_roles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

create policy "Users can choose their account role once"
on public.account_roles
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);
