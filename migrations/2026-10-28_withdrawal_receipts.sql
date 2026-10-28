BEGIN;
CREATE TABLE billing_withdrawals (
  id uuid PRIMARY KEY,
  received_at timestamptz NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  contract text NOT NULL,
  statement text NOT NULL,
  identity_verified boolean NOT NULL DEFAULT false,
  rate_key text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','resolved')),
  resolution text,
  resolved_at timestamptz
);
ALTER TABLE billing_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_withdrawals FROM anon,authenticated;
GRANT ALL ON billing_withdrawals TO service_role;
CREATE INDEX billing_withdrawals_email ON billing_withdrawals(email,received_at);
CREATE INDEX billing_withdrawals_pending ON billing_withdrawals(status,received_at);

CREATE FUNCTION receive_withdrawal(p_id uuid,p_received_at timestamptz,p_name text,p_email text,p_contract text,p_statement text,p_rate_key text,p_payload jsonb,p_payload_sha256 text,p_staff_payload jsonb,p_staff_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing billing_withdrawals;
BEGIN
  -- Low-volume legal notices: serialize insertion and rate checks, not account access.
  LOCK TABLE billing_withdrawals IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO existing FROM billing_withdrawals WHERE id=p_id;
  IF FOUND THEN
    IF existing.email<>p_email OR existing.name<>p_name OR existing.contract<>p_contract THEN
      RAISE EXCEPTION 'Request ID already used' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('received_at',existing.received_at);
  END IF;
  IF (SELECT count(*) FROM billing_withdrawals WHERE received_at>now()-interval '1 hour' AND (rate_key=p_rate_key OR email=p_email)) >= 10 THEN
    RETURN jsonb_build_object('rate_limited',true);
  END IF;
  INSERT INTO billing_withdrawals(id,received_at,name,email,contract,statement,rate_key)
    VALUES(p_id,p_received_at,p_name,p_email,p_contract,p_statement,p_rate_key);
  INSERT INTO billing_notices(key,email,kind,payload,payload_sha256)
    VALUES('withdrawal/'||p_id,p_email,'withdrawal_receipt/2026-10-28',p_payload,p_payload_sha256),
      ('withdrawal-staff/'||p_id,'support@autolister.app','withdrawal_staff/2026-10-28',p_staff_payload,p_staff_sha256);
  RETURN jsonb_build_object('received_at',p_received_at);
END $$;
REVOKE ALL ON FUNCTION receive_withdrawal(uuid,timestamptz,text,text,text,text,text,jsonb,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION receive_withdrawal(uuid,timestamptz,text,text,text,text,text,jsonb,text,jsonb,text) TO service_role;
COMMIT;
