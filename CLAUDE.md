# Claude Instructions

This repo is the AutoLister backend/site/admin app. Treat `main` as the production backend/site/admin branch.

## Production Log Investigations

Before querying production/admin/Vercel logs, read and follow:

- `docs/production-log-runbook.md`

Do not start from memory or list rows only. Use `log-detail` for request bodies, Vercel logs for endpoint-hit proof when admin logs omit successful rows, and the required network/approval mode if the CLI sandbox blocks DNS.
