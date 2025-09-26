# Quick Vint API / AutoLister.app

This repository contains the serverless API and static site for AutoLister.app.

See `README_HEADERS.md` for information about the shared header partial and build steps.

Development

- Start Vercel dev server:

```bash
npm run dev
```

Build (header inlining)

```bash
npm run build
```

Verify no placeholders remain

```bash
npm run check-placeholders
```

Deployment

Vercel will run `npm run vercel-build` during deployment which calls the inliner script to inline the shared header into pages that use the placeholder.
