create or replace function public.cancel_site_promotion_draft(p_promotion_id uuid)
returns public.local_promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_promotion public.local_promotions;
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  update public.local_promotions
  set status = 'cancelled', updated_at = now()
  where id = p_promotion_id
    and host_id = (select auth.uid())
    and status = 'draft'
  returning * into cancelled_promotion;

  if cancelled_promotion.id is null then
    raise exception 'Only a private draft can be discarded.';
  end if;

  return cancelled_promotion;
end;
$$;

grant execute on function public.cancel_site_promotion_draft(uuid) to authenticated;
