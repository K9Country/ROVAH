-- A host may continue editing a site after approval, but an approved site may not
-- be placed back into the review queue or unpublished by a host-side update.
create or replace function public.enforce_property_review_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_administrator boolean;
begin
  select current_user = 'postgres' or exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  )
  into is_administrator;

  if tg_op = 'INSERT' then
    if not is_administrator then
      new.approval_status := 'pending';
      new.is_published := false;
      new.reviewed_at := null;
      new.reviewed_by := null;
      new.review_notes := null;
    end if;
    return new;
  end if;

  -- Approval is final. Site edits remain allowed, but they cannot resubmit or
  -- unpublish an already approved site.
  if old.approval_status = 'approved' and new.approval_status <> 'approved' then
    new.approval_status := 'approved';
    new.is_published := true;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.review_notes := old.review_notes;
  elsif not is_administrator and (
    new.approval_status is distinct from old.approval_status
    or new.is_published is distinct from old.is_published
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.review_notes is distinct from old.review_notes
  ) then
    new.approval_status := old.approval_status;
    new.is_published := old.is_published;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.review_notes := old.review_notes;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_property_review_lifecycle on public.properties;
create trigger enforce_property_review_lifecycle
before insert or update on public.properties
for each row
execute function public.enforce_property_review_lifecycle();

-- Repair any listings that were accidentally sent back to pending after an
-- administrator had already reviewed them.
update public.properties
set approval_status = 'approved',
    is_published = true
where approval_status = 'pending'
  and reviewed_at is not null
  and reviewed_by is not null;
