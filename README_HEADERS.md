Header sharing and build instructions

This project uses a shared header partial which is inlined into production HTML during build to ensure consistent headers and better SEO.

Files
- public/partials/header.html — canonical header markup
- public/css/header.css — shared header styles
* public/js/header.js — (removed) runtime loader was used for dev convenience; project now uses build-time inlining by default
- scripts/build-headers.js — build-time inliner: replaces the placeholder <div id="shared-header-placeholder"></div> with the partial
- scripts/check-placeholders.js — verifies there are no remaining placeholders in public/ (exit code 2 if any found)

How to use locally
1. Install dependencies (if needed):

```bash
npm install
```

2. Build (inlines header into HTML files with placeholders):

```bash
npm run build
```

3. Verify no placeholders remain:

```bash
npm run check-placeholders
```

Vercel deployment
- Vercel will run the `vercel-build` script if present. This project defines `vercel-build` to run the inliner so the deployed HTML will contain the header inline (no runtime fetch required).
- No additional Vercel configuration is required for the header inlining. If you have custom CSP rules, ensure they allow same-origin scripts while testing; however inlined HTML will minimize CSP issues in production.

Optional
The repository no longer includes `public/js/header.js`; header partials are inlined at build time. If you want a dev-only runtime loader, reintroduce a similar script and include it in pages for local testing.
- Add CI step to run `npm run check-placeholders` to enforce that there are no placeholders before merging.
