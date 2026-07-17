-- Sites are not public until an administrator explicitly approves them.

update public.properties
set
  approval_status = 'pending',
  is_published = false,
  review_notes = null,
  reviewed_at = null,
  reviewed_by = null
where approval_status = 'approved';
