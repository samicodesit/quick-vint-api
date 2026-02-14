-- Migration: Add unsubscribe_token to profiles
-- This enables secure, tokenized unsubscribe links instead of exposing email addresses in URLs.

-- 1. Add the column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid() NOT NULL;

-- 2. Create a unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unsubscribe_token
  ON profiles (unsubscribe_token);

-- 3. Backfill any existing rows that somehow got NULL (shouldn't happen with DEFAULT, but safety net)
UPDATE profiles
  SET unsubscribe_token = gen_random_uuid()
  WHERE unsubscribe_token IS NULL;

-- 4. Ensure new rows always get a token automatically via a trigger
--    (The DEFAULT handles inserts, but this trigger covers edge cases like explicit NULL inserts)
CREATE OR REPLACE FUNCTION ensure_unsubscribe_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unsubscribe_token IS NULL THEN
    NEW.unsubscribe_token := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_unsubscribe_token ON profiles;

CREATE TRIGGER trg_ensure_unsubscribe_token
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_unsubscribe_token();
