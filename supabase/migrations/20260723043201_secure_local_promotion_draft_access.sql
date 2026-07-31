-- Keep the host promotion draft endpoint unavailable to anonymous visitors.
revoke execute on function public.create_local_promotion_draft(uuid, text) from public;
revoke execute on function public.create_local_promotion_draft(uuid, text) from anon;
grant execute on function public.create_local_promotion_draft(uuid, text) to authenticated;

-- A paid promotion will need a scheduled delivery window before it is actually
-- delivered, so keep the dates paired without tying them to a single status.
alter table public.local_promotions
  drop constraint local_promotions_check;

alter table public.local_promotions
  add constraint local_promotions_delivery_window_check
  check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  );
