# Homepage Tier Proof Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the uninstall page's tier-aware four-value proof strip to the homepage, centered at the bottom of the initial desktop viewport before docking seamlessly into normal hero flow.

**Architecture:** Keep the feature inside the existing localized homepage component. A reserved slot holds the rail's eventual position; desktop CSS fixes the rail to the viewport until one `IntersectionObserver` marks the slot as docked, while mobile remains normal flow. The existing hero and testimonial stay intact.

**Tech Stack:** Astro, TypeScript, Tailwind utilities, component-scoped CSS, Vitest, Playwright/Chromium browser checks.

## Global Constraints

- Use standard monthly prices: Starter €3.99, Pro €9.99, Business €19.99.
- Preserve the uninstall page's four propositions: price, ChatGPT Plus comparison, included listings, and average draft speed.
- Keep the testimonial, bullets, CTAs, video, screenshots, and listings counter.
- Do not add dependencies or refactor the uninstall page.
- Mobile remains in normal flow as a compact two-column grid.
- No count-up or entrance animation; respect reduced motion.

---

### Task 1: Localized proof content and tier switching

**Files:**

- Modify: `src/i18n/site.ts`
- Modify: `src/components/HomeLanding.astro`
- Test: `src/components/__tests__/HomeLandingPerformance.test.ts`

**Interfaces:**

- Consumes: existing `SiteExtraHomeCopy`, `extra`, and locale-aware homepage rendering.
- Produces: `extra.tierProof` with localized labels and `starter`, `pro`, `business` values; DOM hooks `data-home-tier-option`, `data-home-tier-proof`, and `data-home-tier-link`.

- [ ] **Step 1: Write the failing content test**

Add assertions that the source contains the standard prices, all three tier keys, the four proof fields, and no homepage use of `LISTFASTER20` or discounted values.

```ts
expect(source).toContain('data-home-tier-option="starter"');
expect(source).toContain('data-home-tier-proof="priceValue"');
expect(source).toContain("extra.tierProof");
expect(source).not.toContain("LISTFASTER20");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/__tests__/HomeLandingPerformance.test.ts`

Expected: FAIL because the tier-proof markup and copy do not exist.

- [ ] **Step 3: Add the localized copy shape and values**

Extend `SiteExtraHomeCopy` with this exact structure and provide translations for every existing site locale:

```ts
tierProof: {
  ariaLabel: string;
  tierLabel: string;
  chooseTier: string;
  priceLabel: string;
  comparisonLabel: string;
  listingsLabel: string;
  speedLabel: string;
  tiers: Record<
    "starter" | "pro" | "business",
    {
      name: string;
      priceValue: string;
      comparisonValue: string;
      listingsValue: string;
      speedValue: string;
    }
  >;
}
```

Use standard prices and truthful comparison values: `~80% cheaper`, `~50% cheaper`, and `Comparable price` in English; listings `75`, `250`, `600`; speed `Average 5 seconds`.

- [ ] **Step 4: Render the selector and four-value rail**

Add a reserved slot after the hero grid. Render three accessible tab buttons, four proof cells, and a pricing link. Encode the localized tier map in one escaped `data-tier-values` JSON attribute so switching does not require duplicated script data.

- [ ] **Step 5: Add minimal tier-switching behavior**

In the existing homepage script, parse `data-tier-values`, update the four `[data-home-tier-proof]` nodes, set `aria-selected`, and update the link to `/${locale === "en" ? "" : `${locale}/`}pricing?plan=<tier>`.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `npm test -- src/components/__tests__/HomeLandingPerformance.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the content behavior**

```bash
git add src/i18n/site.ts src/components/HomeLanding.astro src/components/__tests__/HomeLandingPerformance.test.ts
git commit -m "Add homepage tier proof strip"
```

### Task 2: Fixed-to-flow positioning and responsive polish

**Files:**

- Modify: `src/components/HomeLanding.astro`
- Test: `src/components/__tests__/HomeLandingPerformance.test.ts`
- Create: `/tmp/autolister-home-proof-visual.mjs` (local verification only; do not commit)

**Interfaces:**

- Consumes: `[data-home-proof-slot]` and `[data-home-proof-rail]` from Task 1.
- Produces: `data-docked` slot state and responsive `.home-tier-proof-*` styles.

- [ ] **Step 1: Write the failing behavior test**

Assert the source includes the slot/rail hooks, `IntersectionObserver`, a normal-flow mobile fallback, fixed desktop positioning, and no removal of `testimonialQuote`.

```ts
expect(source).toContain("data-home-proof-slot");
expect(source).toContain("data-home-proof-rail");
expect(source).toContain("IntersectionObserver");
expect(source).toContain("extra.testimonialQuote");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/__tests__/HomeLandingPerformance.test.ts`

Expected: FAIL before the positioning behavior exists.

- [ ] **Step 3: Implement the fixed-to-flow handoff**

Add one observer that marks the slot `data-docked="true"` when its top reaches the fixed rail's current top. Recalculate on resize. Without observer support, set docked immediately so normal flow remains usable.

- [ ] **Step 4: Add responsive CSS**

Desktop: reserve the full rail height, fix it centered with `left: 50%`, `bottom: 20px`, `transform: translateX(-50%)`, and dock it absolutely inside the slot. Use a maximum width aligned to the hero content. Mobile: position static, two columns, no fixed behavior. Add low-height desktop spacing adjustments only where visual evidence shows overlap.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- src/components/__tests__/HomeLandingPerformance.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 6: Build and run real-browser checks**

Run the production build and local preview. Use Chromium screenshots and geometry assertions at 1366×768, 1440×900, 1920×1080, 2560×1080, and 390×844. Verify desktop rail centering, bottom gap, no overlap with visible hero controls, seamless docking, preserved testimonial, mobile 2×2 flow, tier text/link updates, and zero layout jump at handoff.

- [ ] **Step 7: Refine from screenshots and rerun checks**

Change only spacing, sizing, or breakpoint values demonstrated necessary by the screenshots. Rerun the same viewport matrix until every assertion and visual check passes.

- [ ] **Step 8: Run the full production gate**

Run: `npm run verify:production`

Expected: lint, types, formatting, build, and all tests PASS.

- [ ] **Step 9: Commit and push**

```bash
git add src/components/HomeLanding.astro src/components/__tests__/HomeLandingPerformance.test.ts src/i18n/site.ts
git commit -m "Polish homepage tier proof positioning"
npm run push:production
```

- [ ] **Step 10: Verify production**

Confirm the production Vercel deployment is Ready, run the browser geometry check against `https://autolister.app`, and verify `main` equals `origin/main`.
