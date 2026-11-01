-- Reuse existing transactional caps and cleanup. No customer data table access.
create function public.autolister_hosted_handoff(op text, seller_id text, item_id uuid, payload text default null, amount integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 clock timestamptz:=clock_timestamp();
 utc_day date:=(clock at time zone 'UTC')::date;
 utc_month date:=date_trunc('month',utc_day::timestamp)::date;
 shared autolister_plugin.monthly;
 active autolister_plugin.ticket;
 hold autolister_plugin.reservation;
 account autolister_plugin.daily;
 budget integer;

begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise insufficient_privilege; end if;
 if seller_id is null or seller_id !~ '^[0-9a-f]{64}$' or item_id is null or op is null
    or op not in ('put','metadata','photo','settle') then raise invalid_parameter_value; end if;
 -- Serialize one seller across day rollover and simultaneous opens/workers.
 perform pg_advisory_xact_lock(hashtextextended(seller_id, 941));
 if op='settle' then
   delete from autolister_plugin.reservation where id=item_id and seller=seller_id and expires_at>clock returning * into hold;
   if found then
     if amount is null or amount<0 or amount>hold.bytes then raise invalid_parameter_value; end if;
     update autolister_plugin.monthly set bytes_used=bytes_used-(hold.bytes-amount)
       where month_start=date_trunc('month',hold.day::timestamp)::date;
     update autolister_plugin.daily set bytes_used=bytes_used-(hold.bytes-amount) where seller=hold.seller and day=hold.day;
   end if;
   return '{}'::jsonb;
 end if;
 -- Hold the shared month row until the reservation commits. Network transfers
 -- run after this transaction; sellers do not wait on each other's downloads.
 insert into autolister_plugin.monthly(month_start) values(utc_month) on conflict do nothing;
 select * into strict shared from autolister_plugin.monthly where month_start=utc_month for update;
 if op='put' and shared.prepares>=12000 then return '{"error":"global_prepare_cap"}'; end if;
 if op<>'put' and shared.reads>=60000 then return '{"error":"global_read_cap"}'; end if;
 insert into autolister_plugin.daily(seller,day) values(seller_id,utc_day) on conflict do nothing;
 select * into strict account from autolister_plugin.daily where seller=seller_id and day=utc_day;
 if op='put' then
   if payload is null or octet_length(payload)>100000 or (amount is not null and amount not between 1 and 900000) then raise invalid_parameter_value; end if;
   if account.prepares>=64 then return '{"error":"prepare_cap"}'; end if;
   update autolister_plugin.monthly set prepares=prepares+1 where month_start=utc_month;
   update autolister_plugin.daily set prepares=prepares+1 where seller=seller_id and day=utc_day;
   if exists(select 1 from autolister_plugin.ticket where seller=seller_id and id=item_id and expires_at>clock) then
     -- A retry can have fresher signed image URLs. Preserve its expiry and active slot.
     if amount is null then
       update autolister_plugin.ticket set token=payload where seller=seller_id and id=item_id;
     end if;
     return '{}'::jsonb;
   end if;
   if (select count(*) from autolister_plugin.ticket where seller=seller_id and expires_at>clock)>=20 then return '{"error":"active_cap"}'; end if;
   insert into autolister_plugin.ticket values(seller_id,item_id,payload,clock+coalesce(amount,900000)*interval '1 millisecond')
   on conflict(seller,id) do update set token=excluded.token,expires_at=excluded.expires_at;
   return '{}'::jsonb;
 end if;
 if account.reads>=512 then return '{"error":"read_cap"}'; end if;
 update autolister_plugin.monthly set reads=reads+1 where month_start=utc_month;
 update autolister_plugin.daily set reads=reads+1 where seller=seller_id and day=utc_day;
 select * into active from autolister_plugin.ticket where seller=seller_id and id=item_id and expires_at>clock;
 if not found then return '{"error":"missing"}'; end if;
 if op='metadata' then
   return jsonb_build_object('token',active.token,'localOnly',account.attempts>=256 or account.bytes_used>=134217728,
     'globalLocalOnly',shared.attempts>=40000 or shared.bytes_used>=10737418240);
 end if;
 if shared.attempts>=40000 or shared.bytes_used>=10737418240 then return '{"error":"global_photo_cap"}'; end if;
 budget:=least(8388608,134217728-account.bytes_used,10737418240-shared.bytes_used);
 if account.attempts>=256 or budget<=0 then return '{"error":"photo_cap"}'; end if;
 update autolister_plugin.monthly set bytes_used=bytes_used+budget,attempts=attempts+1 where month_start=utc_month;
 update autolister_plugin.daily set bytes_used=bytes_used+budget,attempts=attempts+1 where seller=seller_id and day=utc_day;
 insert into autolister_plugin.reservation(seller,day,bytes,expires_at)
 values(seller_id,utc_day,budget,clock+interval '5 min') returning * into hold;
 return jsonb_build_object('token',active.token,'reservation',hold.id,'budget',budget);
end $$;
revoke all on function public.autolister_hosted_handoff(text,text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.autolister_hosted_handoff(text,text,uuid,text,integer) to service_role;
