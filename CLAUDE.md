# Claude Instructions

This repo is the AutoLister backend/site/admin app. Treat `main` as the production backend/site/admin branch.

## Checks

For production backend/site/admin pushes, use:

```bash
npm run push:production
```

That command refuses non-`main`, runs `npm run verify:production`, then pushes only if the gate passes. For checking without pushing, run `npm run verify:production`.

Endpoint incidents need endpoint-level tests under `src/api/__tests__/` or a documented reason why the behavior cannot be tested there. Helper-only tests are not enough for `/api/generate`, auth, Stripe, phone upload, admin, or logging changes.

## Production Log Investigations

Before querying production/admin/Vercel logs, read and follow:

- `docs/production-log-runbook.md`

Hard wall: production admin/API/Vercel log queries must be run with network escalation on the first attempt in Codex. Do not try sandboxed `curl`, `vercel logs`, or production helper scripts first. Use `log-detail` for request bodies and Vercel logs for endpoint-hit proof when admin logs omit successful rows.
