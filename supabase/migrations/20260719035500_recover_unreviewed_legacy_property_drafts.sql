-- Before the private draft workflow, every new host property was incorrectly
-- placed in pending review at creation. Those unreviewed listings could never
-- have been intentionally submitted because the host screen locked the submit
-- action. Return them to private drafts so hosts can finish their setup.
update public.properties
set approval_status = 'draft',
    is_published = false,
    reviewed_at = null,
    reviewed_by = null,
    review_notes = null
where approval_status = 'pending'
  and reviewed_at is null;
