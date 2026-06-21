ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS abuse_reason text,
  ADD COLUMN IF NOT EXISTS abuse_notes text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by text;

UPDATE profiles
SET account_status = 'active'
WHERE account_status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'paused'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_account_status
  ON profiles (account_status);
