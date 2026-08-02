create or replace function public.sync_property_booking_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.property_booking_blocks where booking_id = old.id;
    return old;
  end if;

  delete from public.property_booking_blocks where booking_id = new.id;

  if new.status in ('confirmed', 'payment_pending') then
    insert into public.property_booking_blocks (booking_id, property_id, start_at, end_at)
    values (new.id, new.property_id, new.start_at, new.end_at);
  end if;

  return new;
end;
$function$;
