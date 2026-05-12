-- preference_suggestions: stores user-submitted ideas for new listing preference checkboxes.
-- The AutoLister team reviews these and may promote popular ones to the predefined list.

CREATE TABLE IF NOT EXISTS preference_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  suggestion text NOT NULL CHECK (char_length(suggestion) BETWEEN 5 AND 200),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE preference_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own suggestions (via API, not direct DB access).
-- Only service role can SELECT (admin only).
CREATE POLICY "insert_own_suggestion" ON preference_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
