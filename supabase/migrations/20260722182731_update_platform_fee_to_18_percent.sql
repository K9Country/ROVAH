-- K9 Country retains 18% of the original booking value. Resolution Discounts
-- therefore cap at 82%, leaving the platform fee intact and host payout at $0.
create or replace function public.issue_resolution_discount(
  p_property_id uuid,
  p_member_id uuid,
  p_discount_percent numeric,
  p_expires_at date,
  p_note text default null
)
returns public.resolution_discount_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_offer public.resolution_discount_offers;
  conversation_id uuid;
  property_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required';
  end if;

  select name into property_name
  from public.properties
  where id = p_property_id and host_id = (select auth.uid());

  if property_name is null then
    raise exception 'Only the host of this property can issue a Resolution Discount';
  end if;

  if not exists (
    select 1 from public.guest_profiles
    where user_id = p_member_id and profile_completed_at is not null
  ) then
    raise exception 'Resolution Discounts can only be issued to a completed member profile';
  end if;

  if p_discount_percent is null or p_discount_percent <= 0 or p_discount_percent > 82 then
    raise exception 'Resolution Discounts must be between 1%% and 82%%';
  end if;

  if p_expires_at is null or p_expires_at < current_date then
    raise exception 'Choose an expiration date in the future';
  end if;

  insert into public.resolution_discount_offers (
    property_id, member_id, issued_by, discount_percent, expires_at, note
  ) values (
    p_property_id, p_member_id, (select auth.uid()), round(p_discount_percent, 2), p_expires_at, nullif(btrim(p_note), '')
  ) returning * into created_offer;

  insert into public.property_conversations (property_id, guest_id, host_id)
  values (p_property_id, p_member_id, (select auth.uid()))
  on conflict (host_id, guest_id) do update set host_id = excluded.host_id
  returning id into conversation_id;

  insert into public.property_messages (conversation_id, sender_id, message_text)
  values (
    conversation_id,
    (select auth.uid()),
    format(
      'A %s%% Resolution Discount has been issued for you at %s. It will be available when you make your next reservation for this private space and can be used once through %s.%s',
      trim(to_char(created_offer.discount_percent, 'FM999990.00')),
      property_name,
      to_char(created_offer.expires_at, 'FMMonth FMDD, YYYY'),
      case when created_offer.note is null then '' else E'\\n\\nNote from your host: ' || created_offer.note end
    )
  );

  return created_offer;
end;
$$;

revoke all on function public.issue_resolution_discount(uuid, uuid, numeric, date, text) from public;
grant execute on function public.issue_resolution_discount(uuid, uuid, numeric, date, text) to authenticated;
