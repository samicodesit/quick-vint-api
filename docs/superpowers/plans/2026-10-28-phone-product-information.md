# Phone product information, October 28, 2026

## Scope and decisions

User-approved scope: prepare and test accurate phone-only product information without deploying. Preserve search intent, URLs, titles, H1s, metadata, canonical and alternate links, sitemap membership and the running homepage experiment. Add useful explanations to existing pages instead of creating competing landing pages.

Work from production commit 742e93a on codex/phone-product-information. The default checkout is an older, dirty feature branch. The native worktree tool rejected the repository path because the configured workspace is its parent; a local Git worktree provides isolation without changing either existing checkout. No subagents, push or deployment.

1. Capture rendered SEO metadata and sitemap baseline from production source.
2. Correct the 24 translated listing guides with phone workflow information, an app entry link and accurate extension context. Retain desktop instructions and screenshot with explicit desktop context.
3. Add phone help to support, the description generator, the older ChatGPT comparison guide and the Orion guide. Preserve extension-specific instructions and page targeting.
4. Describe the web application separately from the Chrome extension in structured data on pages that explain both. Do not assign extension ratings to the web app. Keep FAQs synchronized with visible copy.
5. Build and compare SEO invariants; run existing guide checks, focused regressions and the production verification gate. Inspect local rendered pages at desktop and phone widths. Record untested authenticated steps and any existing gate failures.

## Evidence and acceptance

The October 28 AI pilot found answers citing our extension-only guide/support information. Feature newness can contribute to delayed recognition, but its effect has not been isolated. Search Console export through October 23 records more impressions but fewer clicks than the preceding period; this is not evidence that a broad rewrite would help.

References: https://developers.google.com/search/docs/appearance/ai-features and https://developers.google.com/search/docs/fundamentals/creating-helpful-content. Clear visible content and matching structured data are the intended correction; no special AI schema, crawler policy changes or ranking promises.

Completion requires a reviewable diff, measured preservation of SEO invariants, recorded checks and no deployment. Production recrawling and repeated neutral AI tests follow a separately approved release.

## Completion ledger

All five steps completed locally. The owner clarified that Orion is a positive product path, the photo guide must cover both web and extension workflows, and the defensive checklist and vague buttons should be replaced. The final guides name each destination, explain copying only for the web app, retain the Orion guide and add links to it in all eight languages. The photo guide has a simple three-step workflow; existing checklist anchors and the dedicated checklist page remain.

Final evidence and limits are recorded in `docs/growth-current-sprint.md`. Before/after SEO fingerprints match across 134 HTML files and 112 sitemap entries. Lint, types, build, format and all 1,198 tests pass with two test workers; 13 opt-in browser tests remain skipped. No deployment occurred. The worktree remains the reviewable deliverable.

Owner-approved follow-up after independent review: correct the old comparison claims and unsupported rating with minimal scope. Completed in the same worktree. Removed the unverified global rating and corrected browser requirements, comparison capabilities, timings and signup wording. One intentional metadata exception updates the comparison page description to include the web app; title, H1, URL, canonical, hreflang, robots and sitemap remain unchanged. The complete local gate passed again with 1,198 tests and 13 opt-in skips. See the newer sprint entry for superseding evidence.
