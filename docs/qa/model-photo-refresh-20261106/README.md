# V2 model-photo content review

State: local draft, awaiting owner approval for production publication.

The current product compiler generated a fictional v2 model, then two photographs of the already-public beige embroidered top. There were no prompt or model overrides, retouching or customer account writes. The classifier found no rear source. Both outputs are front views, and the second is labelled accordingly. WebP exports only resize the accepted outputs. The social/zoom comparison combines the original and first AI photo with explicit labels, without marketplace UI or sales metrics.

Changed placements: homepage hero thumbnail, shared photo section and gallery in eight languages; feature pages and how-to guides in English, Dutch, French and German; the affected social and article image metadata. The gallery has a new current-example card followed by the existing seller comparison. The feature page and guide also retain the seller comparison separately.

The owner's girlfriend's comparison images, five case-study assets and four story sources have not changed. Their SHA-256 hashes and the new assets' dimensions, sizes, provider usage, checks and source provenance are recorded in `provenance.json`.

Validation: 60 desktop/mobile/narrow-page checks and eight existing variant-B homepage checks. Images loaded, pages had no horizontal overflow or JavaScript exceptions, and both gallery zoom sources were verified. Local app, pricing and seller-story destinations returned their expected pages. The full production gate passed 1,685 tests, with 22 existing opt-in skips, together with lint, types, formatting and the content-enabled build. No fresh end-to-end signup, customer generation or live marketplace journey is claimed.

The provider token-cost estimate is USD 0.12976425. The authorized task ceiling was USD 1. No advertising, deployment or customer contact occurred.

Reproducible task scripts and full command logs are in the parent workspace's `reports/model-photo-refresh-20261106/`. Actual rendered placement images are in `C:/Users/Sami/.codex/visualizations/2026/11/06/01a1b308-10ab-78a1-8bb5-0ae62b6cf2ac/model-photo-refresh/`.
