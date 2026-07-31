create or replace function public.record_local_promotion_engagement(
  p_promotion_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_action not in ('viewed', 'opened') then
    raise exception 'Invalid promotion activity';
  end if;

  if not exists (
    select 1
    from public.local_promotion_deliveries delivery
    join public.local_promotions promotion on promotion.id = delivery.promotion_id
    where delivery.promotion_id = p_promotion_id
      and delivery.member_id = (select auth.uid())
      and delivery.dismissed_at is null
      and promotion.status = 'active'
      and promotion.starts_at <= now()
      and promotion.ends_at > now()
  ) then
    raise exception 'This promotion is not available to your account';
  end if;

  if p_action = 'viewed' then
    update public.local_promotion_deliveries
    set viewed_at = coalesce(viewed_at, now())
    where promotion_id = p_promotion_id
      and member_id = (select auth.uid());
    update public.local_promotions
    set viewed_count = (
      select count(*) from public.local_promotion_deliveries
      where promotion_id = p_promotion_id and viewed_at is not null
    ), updated_at = now()
    where id = p_promotion_id;
  else
    update public.local_promotion_deliveries
    set property_opened_at = coalesce(property_opened_at, now())
    where promotion_id = p_promotion_id
      and member_id = (select auth.uid());
    update public.local_promotions
    set property_open_count = (
      select count(*) from public.local_promotion_deliveries
      where promotion_id = p_promotion_id and property_opened_at is not null
    ), updated_at = now()
    where id = p_promotion_id;
  end if;
end;
$$;

revoke all on function public.record_local_promotion_engagement(uuid, text) from public;
revoke execute on function public.record_local_promotion_engagement(uuid, text) from anon;
grant execute on function public.record_local_promotion_engagement(uuid, text) to authenticated;
