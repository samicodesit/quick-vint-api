# Agent Instructions

This repo is mostly operated by AI agents. Treat `main` as the production backend/site/admin branch.

## Deployment

Vercel deploys from `main` automatically.

- After committing changes that should go live, run `npm run push:production`.
- Do not call backend/admin/API work "pushed" unless `origin/main` moved.
- Use `npm run push:production` for backend/admin/API pushes. It refuses non-`main`, runs the production gate, then pushes only if the gate passes.
- Valid completion proof for a live backend push must include:

```txt
Repo: quick-vint-api
Branch pushed: main
Push output includes: main -> main
```

- Pushing a feature branch is only branch backup. It does not count as pushed or deployed.
- Do not run `vercel deploy --prod` after a normal push to `main`.
- Only deploy manually if the operator explicitly asks for it, or if auto-deploy is confirmed broken and the operator approves the manual deploy.

## Checks

The production push command runs the full local gate:

```bash
npm run push:production
```

For checking without pushing, run `npm run verify:production`.

Do not call a backend/API fix complete from helper-level tests only. Endpoint incidents need endpoint-level tests under `src/api/__tests__/` or a documented reason why the behavior cannot be tested there.

For admin UI changes, also run:

```bash
npm test -- src/pages/__tests__/adminHtml.test.ts
```

## Production Log Investigations

Before querying production/admin/Vercel logs, read and follow:

- `docs/production-log-runbook.md`

Do not start from memory or list rows only. Use `log-detail` for request bodies, Vercel logs for endpoint-hit proof when admin logs omit successful rows, and network escalation for read-only log queries if the CLI sandbox blocks DNS.
