create or replace function public.mark_site_promotion_payment_not_completed(
  p_promotion_id uuid,
  p_checkout_session_id text,
  p_reason text default 'Payment was not completed before checkout expired.'
)
returns public.local_promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_promotion public.local_promotions;
begin
  update public.local_promotions
  set status = 'failed', updated_at = now()
  where id = p_promotion_id
    and status = 'pending_payment'
    and stripe_checkout_session_id = p_checkout_session_id
  returning * into updated_promotion;

  if updated_promotion.id is null then
    select * into updated_promotion from public.local_promotions where id = p_promotion_id;
    if updated_promotion.id is null then raise exception 'Promotion was not found'; end if;
    return updated_promotion;
  end if;

  insert into public.host_promotion_notifications (host_id, promotion_id, kind, title, body)
  values (updated_promotion.host_id, updated_promotion.id, 'payment_not_completed', 'Promotion payment not completed', p_reason)
  on conflict (promotion_id, kind) do nothing;

  return updated_promotion;
end;
$$;

revoke all on function public.mark_site_promotion_payment_not_completed(uuid, text, text) from public, anon, authenticated;
