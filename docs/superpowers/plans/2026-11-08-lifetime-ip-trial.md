# Lifetime IP trial allowance

One public IP shares five free drafts across accounts, with no time reset. Preserve existing per-account limits, paid access, purchased credits, and permanent exceptions. The database reserves the IP allowance in the same transaction as the draft and releases it only when the draft reservation is refunded.

- Add a database regression for four drafts on one account, one on another, and a blocked sixth draft. Cover retries, refunds, a different IP, paid access, and a different client.
- Pass a keyed version of Vercel's public IP through the existing server-only reservation calls. Use the same cap for text drafts, model-only draft admissions, and no-emoji retry admissions. Read the shared allowance for usage and batch capacity.
- Keep the feature disabled until the migration, stable server key, historical seed, retention decision, and production approval are in place. Exercise the existing generation paths locally and run the backend verification suite.

## Activation

1. Approve production rollout and reconcile permanent quota keys with the published two-year retention language for abuse data. The quota table holds only keyed IPs and counts. The reservation stops referencing the key when it commits or refunds.
2. Apply the migration with the flag off. Set one stable server key. Seed verified historical free drafts before enabling, including both November 8 IP groups if their retained evidence is sufficient. Use the same normalization and keyed hash as the application. Merge by taking the greater of the existing count and the verified count capped at five, so a repeated seed cannot grant more slots or charge them twice. Omit paid and exempt use. History without reliable IP evidence cannot be reconstructed.
3. Enable the flag and verify the deployed revision, trusted IP header, sixth-draft denial, paid entitlement, and usage response. The flag also disables the old log-based auto-pause to keep one automatic rule active.
