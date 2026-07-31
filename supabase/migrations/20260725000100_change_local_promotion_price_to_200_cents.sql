-- Keep the database-enforced promotion charge aligned with the host-facing
-- Promote Your Spot price. This applies only to local promotions.
begin;

alter table public.local_promotions
  drop constraint if exists local_promotions_amount_cents_check;

update public.local_promotions
  set amount_cents = 200
  where amount_cents <> 200;

alter table public.local_promotions
  add constraint local_promotions_amount_cents_check
  check (amount_cents = 200);

commit;
