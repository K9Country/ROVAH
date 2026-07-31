drop policy if exists "Active loyalty passes are visible on published properties" on public.loyalty_pass_offers;

create policy "Active or member-owned loyalty passes are visible"
on public.loyalty_pass_offers for select
to public
using (
  (
    is_active = true
    and exists (
      select 1 from public.properties
      where properties.id = loyalty_pass_offers.property_id
        and properties.is_published = true
    )
  )
  or exists (
    select 1 from public.member_loyalty_passes pass
    where pass.loyalty_pass_offer_id = loyalty_pass_offers.id
      and pass.member_id = (select auth.uid())
      and pass.status = 'active'
      and pass.credit_hours_remaining > 0
      and pass.expires_at > now()
  )
);
