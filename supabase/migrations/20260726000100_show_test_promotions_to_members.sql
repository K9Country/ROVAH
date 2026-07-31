-- Testing promotions can be discovered only by signed-in users viewing published spaces.
-- Images remain in a private bucket and are delivered through short-lived signed URLs.
alter table public.local_promotions
  add column if not exists test_visible boolean not null default false;

create or replace function public.create_local_promotion_draft(
  p_property_id uuid,
  p_message text,
  p_image_path text default null
)
returns public.local_promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_promotion public.local_promotions;
  normalized_message text := trim(p_message);
  normalized_image_path text := nullif(trim(p_image_path), '');
begin
  if (select auth.uid()) is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'A permanent host account is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = p_property_id
      and host_id = (select auth.uid())
      and is_published = true
  ) then
    raise exception 'Choose one of your approved, published private spaces';
  end if;

  if char_length(normalized_message) not between 1 and 280 then
    raise exception 'Promotion messages must be between 1 and 280 characters';
  end if;

  if lower(normalized_message) ~ '(https?://|www\\.|venmo|cashapp|paypal|wire transfer|text me|call me)' then
    raise exception 'Please remove outside payment or contact requests from this promotion';
  end if;

  if normalized_image_path is not null and (
    char_length(normalized_image_path) > 512
    or split_part(normalized_image_path, '/', 1) <> (select auth.uid()::text)
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'promotion-images'
        and name = normalized_image_path
        and owner_id = (select auth.uid())
    )
  ) then
    raise exception 'Choose a valid photo from your device';
  end if;

  if exists (
    select 1 from public.local_promotions
    where property_id = p_property_id
      and host_id = (select auth.uid())
      and status in ('draft', 'pending_payment', 'paid', 'scheduled', 'delivered')
      and created_at > now() - interval '7 days'
  ) then
    raise exception 'This property already has a recent promotion. Finish or wait before creating another.';
  end if;

  insert into public.local_promotions (
    host_id,
    property_id,
    message,
    message_hash,
    image_path,
    test_visible
  ) values (
    (select auth.uid()),
    p_property_id,
    normalized_message,
    md5(lower(normalized_message)),
    normalized_image_path,
    true
  ) returning * into created_promotion;

  return created_promotion;
end;
$$;

revoke all on function public.create_local_promotion_draft(uuid, text, text) from public;
revoke execute on function public.create_local_promotion_draft(uuid, text, text) from anon;
grant execute on function public.create_local_promotion_draft(uuid, text, text) to authenticated;

drop policy if exists "Authenticated users can view visible test promotions" on public.local_promotions;
create policy "Authenticated users can view visible test promotions"
  on public.local_promotions
  for select
  to authenticated
  using (
    test_visible = true
    and status = 'draft'
    and exists (
      select 1
      from public.properties
      where properties.id = local_promotions.property_id
        and properties.is_published = true
    )
  );

drop policy if exists "Authenticated users can view visible test promotion images" on storage.objects;
create policy "Authenticated users can view visible test promotion images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'promotion-images'
    and exists (
      select 1
      from public.local_promotions
      join public.properties on properties.id = local_promotions.property_id
      where local_promotions.image_path = storage.objects.name
        and local_promotions.test_visible = true
        and local_promotions.status = 'draft'
        and properties.is_published = true
    )
  );
