# Agent Instructions

This repo is mostly operated by AI agents. Treat `main` as the production backend/site/admin branch.

## Deployment

Vercel deploys from `main` automatically.

- After committing changes that should go live, push `main`.
- Do not run `vercel deploy --prod` after a normal push to `main`.
- Only deploy manually if the operator explicitly asks for it, or if auto-deploy is confirmed broken and the operator approves the manual deploy.

## Checks

Before pushing production changes, run the checks that match the touched surface:

```bash
pnpm run type-check
pnpm build
```

For admin UI changes, also run:

```bash
pnpm test src/pages/__tests__/adminHtml.test.ts
```
