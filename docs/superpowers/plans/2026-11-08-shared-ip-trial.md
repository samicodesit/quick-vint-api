# Shared IP trial allowance

One public IP shares five free drafts across accounts for two years from the first counted draft. Preserve existing per-account lifetime limits, paid access, purchased credits, and permanent exceptions. The database reserves the IP allowance in the same transaction as the draft and releases it on refund. Later drafts and denied requests leave the original expiry unchanged.

- Add a database regression for four drafts on one account, one on another, and a blocked sixth draft. Cover retries, refunds, a different IP, paid access, and a different client.
- Pass a keyed version of Vercel's public IP through the existing server-only reservation calls. Use the same cap for text drafts, model-only draft admissions, and no-emoji retry admissions. Read the shared allowance for usage and batch capacity.
- The database ignores expired counters immediately and deletes expired counters and pending reservation links on its scheduled sweep. Keep the feature disabled until the migration, stable server key, verified historical seed, and production checks are in place.

## Activation

1. Apply the migration with the flag off and verify the Supabase cleanup job is active. The quota table holds keyed IPs, counts, and expiry. A reservation stops referencing the key when it commits, refunds, or expires.
2. Set one stable server key. Seed verified historical free drafts before enabling, including both November 8 IP groups if their retained evidence is sufficient. Use the same normalization and keyed hash as the application. For each IP, set the expiry two years from the oldest verified draft and cap the verified count at five. Re-running a seed preserves the earlier expiry and the greater count in the same window. Omit paid, exempt, expired and ambiguous usage.
3. Enable the flag and verify the deployed revision, trusted IP header, sixth-draft denial, paid entitlement, and usage response. The flag also disables the old log-based auto-pause to keep one automatic rule active.
