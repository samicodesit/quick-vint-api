# Claude Instructions

This repo is the AutoLister backend/site/admin app. Treat `main` as the production backend/site/admin branch.

## Checks

Before pushing production backend/site/admin changes, run the full CI-equivalent gate:

```bash
pnpm run lint
pnpm run type-check
pnpm run build
pnpm run format-check
pnpm test
```

Endpoint incidents need endpoint-level tests under `src/api/__tests__/` or a documented reason why the behavior cannot be tested there. Helper-only tests are not enough for `/api/generate`, auth, Stripe, phone upload, admin, or logging changes.

## Production Log Investigations

Before querying production/admin/Vercel logs, read and follow:

- `docs/production-log-runbook.md`

Do not start from memory or list rows only. Use `log-detail` for request bodies, Vercel logs for endpoint-hit proof when admin logs omit successful rows, and the required network/approval mode if the CLI sandbox blocks DNS.
