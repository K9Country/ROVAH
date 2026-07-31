-- Optional promotion photos. The normal $2.00 amount remains stored; testing mode is UI-only.
alter table public.local_promotions add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promotion-images', 'promotion-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Hosts can view their own promotion images" on storage.objects;
drop policy if exists "Hosts can upload their own promotion images" on storage.objects;
drop policy if exists "Hosts can delete their own promotion images" on storage.objects;

create policy "Hosts can view their own promotion images" on storage.objects for select to authenticated
using (bucket_id = 'promotion-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Hosts can upload their own promotion images" on storage.objects for insert to authenticated
with check (bucket_id = 'promotion-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Hosts can delete their own promotion images" on storage.objects for delete to authenticated
using (bucket_id = 'promotion-images' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop function if exists public.create_local_promotion_draft(uuid, text);
create function public.create_local_promotion_draft(p_property_id uuid, p_message text, p_image_path text default null)
returns public.local_promotions language plpgsql security definer set search_path = '' as $$
declare
  created_promotion public.local_promotions;
  normalized_message text := trim(p_message);
  normalized_image_path text := nullif(trim(p_image_path), '');
begin
  if (select auth.uid()) is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then raise exception 'A permanent host account is required'; end if;
  if not exists (select 1 from public.properties where id = p_property_id and host_id = (select auth.uid()) and is_published = true) then raise exception 'Choose one of your approved, published private spaces'; end if;
  if char_length(normalized_message) not between 1 and 280 then raise exception 'Promotion messages must be between 1 and 280 characters'; end if;
  if lower(normalized_message) ~ '(https?://|www\\.|venmo|cashapp|paypal|wire transfer|text me|call me)' then raise exception 'Please remove outside payment or contact requests from this promotion'; end if;
  if normalized_image_path is not null and (char_length(normalized_image_path) > 512 or split_part(normalized_image_path, '/', 1) <> (select auth.uid()::text) or not exists (select 1 from storage.objects where bucket_id = 'promotion-images' and name = normalized_image_path and owner_id = (select auth.uid()))) then raise exception 'Choose a valid photo from your device'; end if;
  if exists (select 1 from public.local_promotions where property_id = p_property_id and host_id = (select auth.uid()) and status in ('draft', 'pending_payment', 'paid', 'scheduled', 'delivered') and created_at > now() - interval '7 days') then raise exception 'This property already has a recent promotion. Finish or wait before creating another.'; end if;
  insert into public.local_promotions (host_id, property_id, message, message_hash, image_path) values ((select auth.uid()), p_property_id, normalized_message, md5(lower(normalized_message)), normalized_image_path) returning * into created_promotion;
  return created_promotion;
end;
$$;
revoke all on function public.create_local_promotion_draft(uuid, text, text) from public;
revoke execute on function public.create_local_promotion_draft(uuid, text, text) from anon;
grant execute on function public.create_local_promotion_draft(uuid, text, text) to authenticated;
