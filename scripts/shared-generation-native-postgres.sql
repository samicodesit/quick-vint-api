-- Isolated database only. These tests load the real reservation migrations.
DO $$ BEGIN
  IF current_database() <> 'autolister_release_test' THEN
    RAISE EXCEPTION 'Refusing a database other than autolister_release_test';
  END IF;
END $$;

CREATE FUNCTION pg_temp.require(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF;
END $$;

CREATE FUNCTION pg_temp.reserve(owner_id uuid, request_id uuid,
  client_name text DEFAULT 'extension', tier text DEFAULT 'pro',
  monthly integer DEFAULT 500, daily integer DEFAULT 50, burst integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE operation jsonb;
BEGIN
  operation := public.claim_mobile_generation_idempotency(owner_id, client_name, request_id, repeat('a',64));
  RETURN public.reserve_and_bind_mobile_generation_reservation(owner_id,
    (operation->>'recordId')::uuid, (operation->>'attemptId')::uuid,
    client_name, request_id, repeat('a',64), 'current', tier, monthly, daily, burst, 5, false);
END $$;

INSERT INTO profiles(id,subscription_status,subscription_tier,api_calls_this_month,
  free_lifetime_generations_used,pack_credits)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'active','pro',0,0,0 FROM generate_series(1,20) n;

DO $$
DECLARE
  owner_id uuid := '00000000-0000-4000-8000-000000000001';
  operation_request_id uuid := gen_random_uuid();
  reservation_id uuid;
  operation jsonb;
  outcome jsonb;
  before_count integer;
  test_owner uuid;
  status_value text;
BEGIN
  -- Actual month/day/global budget writes occur once, not just a mocked row.
  outcome := pg_temp.reserve(owner_id, operation_request_id);
  PERFORM pg_temp.require((outcome->>'allowed')::boolean, 'extension reserve');
  reservation_id := (outcome->>'reservationId')::uuid;
  PERFORM pg_temp.require((SELECT api_calls_this_month=1 FROM profiles WHERE id=owner_id), 'one monthly debit');
  PERFORM pg_temp.require((SELECT count=1 FROM rate_limits WHERE user_id=owner_id AND window_type='day'), 'one daily debit');
  PERFORM pg_temp.require((SELECT total_api_calls=1 FROM daily_stats), 'one global budget debit');
  operation := public.claim_mobile_generation_idempotency(owner_id,'extension',operation_request_id,repeat('a',64));
  PERFORM pg_temp.require(operation->>'kind'='in_progress', 'duplicate in progress');
  outcome := pg_temp.reserve(owner_id,operation_request_id);
  PERFORM pg_temp.require(NOT (outcome->>'allowed')::boolean, 'duplicate reserve denied');
  PERFORM pg_temp.require((SELECT count(*)=1 FROM generation_reservations), 'one reservation row');
  SELECT id,attempt_id INTO reservation_id, test_owner FROM mobile_generation_idempotency i WHERE i.user_id=owner_id AND i.request_id=operation_request_id;
  -- Store before commit, then replay the persisted result after commit.
  PERFORM pg_temp.require(public.mark_mobile_generation_commit_pending(reservation_id,test_owner,
    (SELECT r.id FROM generation_reservations r WHERE r.user_id=owner_id),
    '{"title":"Dress","description":"Saved result"}'::jsonb), 'persist precommit result');
  PERFORM pg_temp.require(public.commit_generation_reservation((SELECT r.id FROM generation_reservations r WHERE r.user_id=owner_id)), 'commit');
  PERFORM pg_temp.require(public.complete_mobile_generation_idempotency(reservation_id,test_owner,
    '{"title":"Dress","description":"Saved result"}'::jsonb,200,
    (SELECT r.id FROM generation_reservations r WHERE r.user_id=owner_id)), 'complete');
  operation := public.claim_mobile_generation_idempotency(owner_id,'extension',operation_request_id,repeat('a',64));
  PERFORM pg_temp.require(operation->>'kind'='succeeded' AND operation->'response'->>'title'='Dress', 'saved result replay');
  PERFORM pg_temp.require((SELECT api_calls_this_month=1 FROM profiles WHERE id=owner_id), 'replay does not debit');
  operation := public.claim_mobile_generation_idempotency(owner_id,'extension',operation_request_id,repeat('b',64));
  PERFORM pg_temp.require(operation->>'kind'='conflict', 'changed payload conflict');

  -- Account and client namespaces are isolated.
  outcome := pg_temp.reserve(owner_id,operation_request_id,'mobile_web');
  PERFORM pg_temp.require((outcome->>'allowed')::boolean, 'mobile namespace');
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000002',operation_request_id);
  PERFORM pg_temp.require((outcome->>'allowed')::boolean, 'other account namespace');
  PERFORM pg_temp.require((SELECT count(*)=3 FROM mobile_generation_idempotency i WHERE i.request_id=operation_request_id), 'three isolated operations');

  -- A failed request refunds real plan counters once.
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000003',gen_random_uuid());
  reservation_id := (outcome->>'reservationId')::uuid;
  PERFORM pg_temp.require(public.refund_generation_reservation(reservation_id,'provider_failed'), 'plan refund');
  PERFORM pg_temp.require(NOT public.refund_generation_reservation(reservation_id,'again'), 'refund idempotent');
  PERFORM pg_temp.require((SELECT api_calls_this_month=0 FROM profiles WHERE id='00000000-0000-4000-8000-000000000003'), 'monthly refund');
  PERFORM pg_temp.require((SELECT count=0 FROM rate_limits WHERE user_id='00000000-0000-4000-8000-000000000003' AND window_type='day'), 'daily refund');

  -- Lifetime and pack balances use the actual production entitlement branches.
  test_owner := '00000000-0000-4000-8000-000000000004';
  UPDATE profiles SET subscription_status='free',subscription_tier='free',pack_credits=2 WHERE id=test_owner;
  outcome := pg_temp.reserve(test_owner,gen_random_uuid(),'extension','free');
  reservation_id := (outcome->>'reservationId')::uuid;
  PERFORM pg_temp.require((SELECT free_lifetime_generations_used=1 AND pack_credits=2 FROM profiles WHERE id=test_owner), 'lifetime entitlement');
  PERFORM pg_temp.require(public.refund_generation_reservation(reservation_id), 'lifetime refund');
  PERFORM pg_temp.require((SELECT free_lifetime_generations_used=0 AND api_calls_this_month=0 FROM profiles WHERE id=test_owner), 'lifetime restored');
  UPDATE profiles SET free_lifetime_generations_used=5 WHERE id=test_owner;
  outcome := pg_temp.reserve(test_owner,gen_random_uuid(),'extension','free');
  reservation_id := (outcome->>'reservationId')::uuid;
  PERFORM pg_temp.require((SELECT pack_credits=1 FROM profiles WHERE id=test_owner), 'pack debit');
  PERFORM pg_temp.require(public.refund_generation_reservation(reservation_id), 'pack refund');
  PERFORM pg_temp.require((SELECT pack_credits=2 FROM profiles WHERE id=test_owner), 'pack restored');
  PERFORM pg_temp.require((SELECT sum(delta)=0 AND count(*)=2 FROM credit_ledger WHERE user_id=test_owner), 'real debit/refund ledger');

  -- Rejections cannot consume any generation entitlement.
  FOREACH status_value IN ARRAY ARRAY['past_due','unpaid'] LOOP
    test_owner := '00000000-0000-4000-8000-000000000005';
    UPDATE profiles SET subscription_status=status_value WHERE id=test_owner;
    outcome := pg_temp.reserve(test_owner,gen_random_uuid());
    PERFORM pg_temp.require(outcome->>'code'='payment_required', 'delinquent payment rejection');
    PERFORM pg_temp.require((SELECT api_calls_this_month=0 FROM profiles WHERE id=test_owner), 'delinquent debit absent');
  END LOOP;
  UPDATE profiles SET api_calls_this_month=1 WHERE id='00000000-0000-4000-8000-000000000006';
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000006',gen_random_uuid(),'extension','pro',1);
  PERFORM pg_temp.require(outcome->>'code'='monthly_limit', 'monthly quota enforced');
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000007',gen_random_uuid(),'extension','pro',500,0);
  PERFORM pg_temp.require(outcome->>'code'='daily_limit', 'daily quota enforced');
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000008',gen_random_uuid(),'extension','pro',500,50,0);
  PERFORM pg_temp.require(outcome->>'limitScope'='minute', 'burst quota enforced');
  UPDATE profiles SET subscription_status='free',subscription_tier='free',free_lifetime_generations_used=5 WHERE id='00000000-0000-4000-8000-000000000009';
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000009',gen_random_uuid(),'extension','free');
  PERFORM pg_temp.require(outcome->>'code'='free_lifetime_limit', 'lifetime quota enforced');

  INSERT INTO system_settings(key,value) VALUES('emergency_brake','true');
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000010',gen_random_uuid());
  PERFORM pg_temp.require(outcome->>'code'='service_unavailable', 'emergency brake enforced');
  UPDATE system_settings SET value='false' WHERE key='emergency_brake';
  UPDATE daily_stats SET estimated_cost=100;
  outcome := pg_temp.reserve('00000000-0000-4000-8000-000000000010',gen_random_uuid());
  PERFORM pg_temp.require(outcome->>'code'='service_unavailable', 'global budget enforced');
  UPDATE daily_stats SET estimated_cost=0;

  -- CREATE OR REPLACE must preserve the original service-only function grants.
  PERFORM pg_temp.require(NOT has_function_privilege('anon',
    'public.reserve_and_bind_mobile_generation_reservation(uuid,uuid,uuid,text,uuid,text,text,text,integer,integer,integer,integer,boolean)','EXECUTE'), 'anon cannot reserve');
  PERFORM pg_temp.require(NOT has_function_privilege('authenticated',
    'public.claim_mobile_generation_idempotency(uuid,text,uuid,text)','EXECUTE'), 'authenticated cannot claim');
  PERFORM pg_temp.require(has_function_privilege('service_role',
    'public.reserve_and_bind_mobile_generation_reservation(uuid,uuid,uuid,text,uuid,text,text,text,integer,integer,integer,integer,boolean)','EXECUTE'), 'service role preserved');
  PERFORM pg_temp.require(NOT has_table_privilege('anon','public.mobile_generation_idempotency','SELECT'), 'retry results private');

  -- Negative control: unprotected calls really do debit twice.
  test_owner := '00000000-0000-4000-8000-000000000012';
  PERFORM public.reserve_generation_request_for_current_status(test_owner,'current','pro',500,50,20,5,false);
  PERFORM public.reserve_generation_request_for_current_status(test_owner,'current','pro',500,50,20,5,false);
  PERFORM pg_temp.require((SELECT api_calls_this_month=2 FROM profiles WHERE id=test_owner), 'unprotected negative control detects two debits');

  SELECT count(*) INTO before_count FROM mobile_generation_idempotency;
  UPDATE mobile_generation_idempotency SET expires_at=now()-interval '2 days' WHERE status='succeeded';
  PERFORM public.cleanup_expired_mobile_generation_idempotency();
  PERFORM pg_temp.require((SELECT count(*)<before_count FROM mobile_generation_idempotency), 'expired cleanup');
END $$;

SELECT jsonb_build_object('actualReservationFunctions',true,'duplicateDebit',false,
  'accountClientIsolation',true,'planLifetimePackRefunds',true,'quotaPaymentBudgetChecks',true,
  'serviceOnlyGrants',true,'negativeControlTwoDebits',true,'expiredCleanup',true);
