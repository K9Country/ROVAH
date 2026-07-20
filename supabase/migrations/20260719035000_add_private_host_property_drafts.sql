-- A host builds a property privately before explicitly submitting it to the
-- administrator. Drafts are never published and are excluded from the review
-- queue until the host changes them to pending.
alter table public.properties
  drop constraint if exists properties_approval_status_check;

alter table public.properties
  add constraint properties_approval_status_check
  check (approval_status in ('draft', 'pending', 'approved', 'declined'));

alter table public.properties
  alter column approval_status set default 'draft';

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
      new.approval_status := 'draft';
      new.is_published := false;
      new.reviewed_at := null;
      new.reviewed_by := null;
      new.review_notes := null;
    end if;
    return new;
  end if;

  -- Approval is final. Site edits remain allowed, but a host cannot unpublish
  -- or resubmit an already approved listing.
  if old.approval_status = 'approved' and new.approval_status <> 'approved' then
    new.approval_status := 'approved';
    new.is_published := true;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.review_notes := old.review_notes;
  elsif not is_administrator then
    -- Only the host's explicit submit action may move an unreviewed draft (or
    -- a listing with requested changes) into the administrator review queue.
    if old.approval_status in ('draft', 'declined') and new.approval_status = 'pending' then
      new.is_published := false;
      new.reviewed_at := null;
      new.reviewed_by := null;
    elsif new.approval_status is distinct from old.approval_status
      or new.is_published is distinct from old.is_published
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.review_notes is distinct from old.review_notes then
      new.approval_status := old.approval_status;
      new.is_published := old.is_published;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
      new.review_notes := old.review_notes;
    end if;
  end if;

  return new;
end;
$$;

-- Recover incomplete listings created by the prior workflow. A listing without
-- an image could not have passed the former submit validation, so it was never
-- actually ready for administrator review.
update public.properties as property
set approval_status = 'draft',
    is_published = false,
    reviewed_at = null,
    reviewed_by = null,
    review_notes = null
where property.approval_status = 'pending'
  and property.reviewed_at is null
  and not exists (
    select 1 from public.property_images image
    where image.property_id = property.id
  );
