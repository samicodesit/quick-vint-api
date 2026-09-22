CREATE TABLE IF NOT EXISTS public.user_attributions (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (
    source IN (
      'tiktok', 'instagram', 'youtube', 'facebook', 'linkedin',
      'reddit', 'google', 'direct', 'unknown'
    )
  ),
  medium TEXT NOT NULL CHECK (
    medium IN (
      'organic_social', 'paid_social', 'referral', 'search',
      'email', 'direct', 'unknown'
    )
  ),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) <= 80),
  content TEXT CHECK (content IS NULL OR char_length(content) <= 80),
  captured_at TIMESTAMPTZ NOT NULL,
  referrer_host TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_attributions_source_claimed_at
  ON public.user_attributions (source, claimed_at DESC);

ALTER TABLE public.user_attributions ENABLE ROW LEVEL SECURITY;
