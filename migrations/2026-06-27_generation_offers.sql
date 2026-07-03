BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS generation_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_key text NOT NULL,
  offer_code text NOT NULL,
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'claimed', 'dismissed')),
  credit_amount integer NOT NULL DEFAULT 1 CHECK (credit_amount > 0),
  trigger_name text NOT NULL,
  trigger_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
  dismissed_at timestamptz
);

ALTER TABLE generation_offers ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_offers_user_campaign
  ON generation_offers (user_id, campaign_key);

CREATE INDEX IF NOT EXISTS idx_generation_offers_user_status_created
  ON generation_offers (user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION claim_generation_offer(
  p_user_id uuid,
  p_offer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offer_row generation_offers%ROWTYPE;
  new_pack_balance integer;
BEGIN
  SELECT *
  INTO offer_row
  FROM generation_offers
  WHERE id = p_offer_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'offer_not_found',
      'error', 'Offer not found.'
    );
  END IF;

  IF offer_row.status <> 'offered' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'offer_already_claimed',
      'error', 'This offer was already claimed.'
    );
  END IF;

  UPDATE generation_offers
  SET
    status = 'claimed',
    claimed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = p_offer_id
    AND status = 'offered';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'offer_already_claimed',
      'error', 'This offer was already claimed.'
    );
  END IF;

  UPDATE profiles
  SET pack_credits = GREATEST(COALESCE(pack_credits, 0), 0) + offer_row.credit_amount
  WHERE id = p_user_id
  RETURNING pack_credits INTO new_pack_balance;

  INSERT INTO credit_ledger (
    user_id,
    type,
    delta,
    balance_after,
    metadata
  )
  VALUES (
    p_user_id,
    'adjustment',
    offer_row.credit_amount,
    COALESCE(new_pack_balance, 0),
    jsonb_build_object(
      'source', 'generation_offer',
      'campaign_key', offer_row.campaign_key,
      'offer_code', offer_row.offer_code,
      'offer_id', offer_row.id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'offerId', offer_row.id,
    'campaignKey', offer_row.campaign_key,
    'offerCode', offer_row.offer_code,
    'creditAmount', offer_row.credit_amount,
    'packCredits', COALESCE(new_pack_balance, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION dismiss_generation_offer(
  p_user_id uuid,
  p_offer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offer_row generation_offers%ROWTYPE;
BEGIN
  SELECT *
  INTO offer_row
  FROM generation_offers
  WHERE id = p_offer_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'offer_not_found',
      'error', 'Offer not found.'
    );
  END IF;

  IF offer_row.status <> 'offered' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'offerId', offer_row.id,
      'status', offer_row.status
    );
  END IF;

  UPDATE generation_offers
  SET
    status = 'dismissed',
    dismissed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = p_offer_id
    AND status = 'offered';

  RETURN jsonb_build_object(
    'ok', true,
    'offerId', offer_row.id,
    'status', 'dismissed'
  );
END;
$$;

COMMIT;
