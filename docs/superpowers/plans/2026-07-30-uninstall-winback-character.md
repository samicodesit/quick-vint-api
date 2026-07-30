# Uninstall Winback Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished 3D character asset to the `/uninstall` winback page, positioned around the coupon area with subtle motion and responsive layout.

**Architecture:** The Chrome extension already routes uninstall users to the backend `/uninstall` page. The change lives in the backend Astro page and public asset folder: generate an optimized character image, render it inside the offer card, and add CSS animation/responsive rules without changing tracking or localized copy.

**Tech Stack:** Astro static page, plain CSS, Vitest page-source tests, Playwright screenshot verification, generated raster asset optimized for web delivery.

## Global Constraints

- The character must sit around the coupon/ticket section.
- The character must not block headline, coupon, CTA, or feedback reasons.
- No new required localized text.
- Respect `prefers-reduced-motion`.
- Keep tracking behavior unchanged.
- Save the final character asset under `public/`.
- Visually verify `/uninstall?preview=1` on desktop and mobile.

---

### Task 1: Page Contract Test

**Files:**

- Create: `src/pages/__tests__/uninstallPage.test.ts`
- Read: `src/pages/uninstall.astro`

**Interfaces:**

- Consumes: static source of `src/pages/uninstall.astro`
- Produces: test assertions that protect the asset markup, coupon placement hook, and reduced-motion CSS

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readUninstallPage() {
  return readFileSync(join(process.cwd(), "src/pages/uninstall.astro"), "utf8");
}

describe("uninstall page winback character", () => {
  it("renders an optimized character asset around the coupon offer", () => {
    const html = readUninstallPage();

    expect(html).toContain('class="offer-visual"');
    expect(html).toContain('src="/uninstall-winback-character.webp"');
    expect(html).toContain('class="coupon-wrap"');
    expect(html).toContain("uninstallCharacterIn");
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/__tests__/uninstallPage.test.ts`

Expected: FAIL because `offer-visual`, `coupon-wrap`, asset path, and animation CSS do not exist.

- [ ] **Step 3: Commit is not required for red state**

Do not commit the failing test alone.

### Task 2: Character Asset

**Files:**

- Create: `public/uninstall-winback-character.webp`
- Temporary generation source can live outside the repo until selected.

**Interfaces:**

- Produces: `/uninstall-winback-character.webp`, a web-optimized transparent or cleanly masked character image.

- [ ] **Step 1: Generate the asset**

Use the image generation tool with this prompt:

```text
Use case: stylized-concept
Asset type: web page winback character for a Chrome extension uninstall offer
Primary request: A premium 3D-rendered gender-neutral seller assistant character sitting beside a coupon/listing ticket, calm and slightly thoughtful, friendly but not childish, broadly appealing across genders.
Subject: modern young adult character with simple neutral clothing, soft rounded 3D form, relaxed seated pose, one hand lightly resting near a blank coupon tag or folded listing card.
Style: polished app-store quality 3D illustration, tasteful, warm, clean, not goofy, not toy-like, not animal-like, not overly cute.
Composition: full character with generous padding, front three-quarter view, suitable for placing near a coupon card on a white web page.
Background: perfectly flat solid #00ff00 chroma-key background for background removal. No shadows, gradients, texture, floor plane, text, watermark, logo, or brand marks. Do not use #00ff00 anywhere in the subject.
```

- [ ] **Step 2: Remove chroma key**

Run:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input <generated-source> \
  --out /private/tmp/uninstall-winback-character.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

- [ ] **Step 3: Convert and optimize**

Run:

```bash
sips -s format webp -s formatOptions 82 -z 520 520 /private/tmp/uninstall-winback-character.png --out public/uninstall-winback-character.webp
```

If `sips` cannot write WebP, use a compressed PNG instead and update Task 1/3 paths to `.png`.

### Task 3: Render and Style

**Files:**

- Modify: `src/pages/uninstall.astro`
- Test: `src/pages/__tests__/uninstallPage.test.ts`

**Interfaces:**

- Consumes: `/uninstall-winback-character.webp`
- Produces: offer-card markup and CSS using `.offer-visual`, `.coupon-wrap`, and `@keyframes uninstallCharacterIn`

- [ ] **Step 1: Add markup around the coupon**

Wrap the coupon card with:

```astro
<div class="coupon-wrap">
  <div class="offer-visual" aria-hidden="true">
    <img src="/uninstall-winback-character.webp" alt="" width="520" height="520" loading="eager" decoding="async" />
  </div>
  <div class="coupon-card" aria-label="Discount code">
    ...
  </div>
</div>
```

- [ ] **Step 2: Add CSS**

Add CSS that positions the character to the right of the coupon on desktop, above/near the coupon on mobile, and uses:

```css
@keyframes uninstallCharacterIn {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .offer-visual img {
    animation: none;
    transform: none;
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- src/pages/__tests__/uninstallPage.test.ts`

Expected: PASS.

### Task 4: Visual and Release Verification

**Files:**

- Read/verify: `src/pages/uninstall.astro`
- Output screenshots: `/private/tmp/autolister-uninstall-character-desktop.png`, `/private/tmp/autolister-uninstall-character-mobile.png`

**Interfaces:**

- Consumes: implemented page and running Astro dev server
- Produces: verified screenshots and passing backend checks

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/pages/__tests__/uninstallPage.test.ts`

- [ ] **Step 2: Run backend build**

Run: `npm run build`

- [ ] **Step 3: Capture screenshots**

Run:

```bash
npx playwright screenshot --viewport-size=1440,1000 'http://localhost:4321/uninstall?preview=1' /private/tmp/autolister-uninstall-character-desktop.png
npx playwright screenshot --viewport-size=390,844 'http://localhost:4321/uninstall?preview=1' /private/tmp/autolister-uninstall-character-mobile.png
```

- [ ] **Step 4: Inspect screenshots**

Confirm the character looks polished, does not cover copy, coupon or CTA, and the feedback section remains visible on mobile.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/pages/uninstall.astro src/pages/__tests__/uninstallPage.test.ts public/uninstall-winback-character.webp docs/superpowers/plans/2026-07-30-uninstall-winback-character.md
git commit -m "Add uninstall winback character"
```
