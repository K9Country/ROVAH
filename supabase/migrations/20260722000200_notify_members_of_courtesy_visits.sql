-- Send a private host-to-member message as part of issuing a Courtesy Visit.

create or replace function public.issue_courtesy_visit(
  p_property_id uuid,
  p_member_id uuid,
  p_hours numeric,
  p_expires_at date,
  p_note text default null
)
returns public.courtesy_visit_credits
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_credit public.courtesy_visit_credits;
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
    raise exception 'Only the host of this property can issue a Courtesy Visit';
  end if;

  if not exists (
    select 1 from public.guest_profiles
    where user_id = p_member_id and profile_completed_at is not null
  ) then
    raise exception 'Courtesy Visits can only be issued to a completed member profile';
  end if;

  if p_hours is null or p_hours <= 0 or p_hours > 100 then
    raise exception 'Courtesy Visit hours must be between 0.5 and 100';
  end if;

  if p_expires_at is null or p_expires_at < current_date then
    raise exception 'Choose an expiration date in the future';
  end if;

  insert into public.courtesy_visit_credits (
    property_id, member_id, issued_by, initial_hours, remaining_hours, expires_at, note
  ) values (
    p_property_id, p_member_id, (select auth.uid()), round(p_hours, 2), round(p_hours, 2), p_expires_at, nullif(btrim(p_note), '')
  ) returning * into created_credit;

  insert into public.property_conversations (property_id, guest_id, host_id)
  values (p_property_id, p_member_id, (select auth.uid()))
  on conflict (property_id, guest_id) do update set host_id = excluded.host_id
  returning id into conversation_id;

  insert into public.property_messages (conversation_id, sender_id, message_text)
  values (
    conversation_id,
    (select auth.uid()),
    format(
      'A Courtesy Visit has been issued for you at %s. You have %s free hour%s available through %s. It will be available when you make your next reservation for this private space.%s',
      property_name,
      trim(to_char(created_credit.remaining_hours, 'FM999990.00')),
      case when created_credit.remaining_hours = 1 then '' else 's' end,
      to_char(created_credit.expires_at, 'FMMonth FMDD, YYYY'),
      case when created_credit.note is null then '' else E'\n\nNote from your host: ' || created_credit.note end
    )
  );

  return created_credit;
end;
$$;

revoke all on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) from public, anon, authenticated;
grant execute on function public.issue_courtesy_visit(uuid, uuid, numeric, date, text) to authenticated;
