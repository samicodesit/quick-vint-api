CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_reservations_one_emoji_retry_per_user
  ON generation_reservations (user_id)
  WHERE (metadata->>'emoji_retry') = 'true';
