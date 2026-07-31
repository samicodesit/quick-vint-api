# Homepage Cold-Load Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the homepage listings meter visually stable and immediately usable throughout a first-ever cold visit.

**Architecture:** Keep the existing deferred public-stats request, but replace the animated counter path with one atomic text update into a fixed-width server-rendered slot. Validate the change against real built pages in fresh Chromium contexts with browser cache disabled and deterministic API timing.

**Tech Stack:** Astro, TypeScript, Vitest, Chromium through Playwright for external performance verification

## Global Constraints

- Do not change the public-stats API, database, analytics, hero layout, copy, or video-loading behavior.
- Do not add a browser-test dependency to the application for this focused fix.
- Every browser measurement uses a new context, cleared cookies and storage, disabled browser cache, and blocked service workers.
- Compare five cold desktop runs and five throttled cold mobile runs before and after.

---

### Task 1: Freeze the Production Baseline

**Files:**

- Create outside repository: `/tmp/autolister-home-benchmark.mjs`
- Create outside repository: `/tmp/autolister-home-before.json`

**Interfaces:**

- Consumes: a target homepage URL and label from command-line arguments
- Produces: median FCP, LCP, DOM interactive, total blocking time, CLS, meter text changes, width range, top-position range, minimum opacity, transform states, and settling time

- [ ] **Step 1: Write the cold-browser benchmark**

The script launches Chromium, creates a new context per run, calls `Network.clearBrowserCache`, enables `Network.setCacheDisabled`, clears cookies/storage, blocks service workers, and records metrics with `PerformanceObserver`. It samples `[data-public-stats]` every animation frame until the meter remains unchanged for 500 ms.

- [ ] **Step 2: Run the production baseline**

Run:

```bash
node /tmp/autolister-home-benchmark.mjs https://autolister.app before
```

Expected: ten successful cold visits and `/tmp/autolister-home-before.json` containing the exact baseline.

### Task 2: Create the Failing Browser Regression

**Files:**

- Create outside repository: `/tmp/autolister-home-meter-test.mjs`
- Modify: `src/components/__tests__/HomeLandingPerformance.test.ts`

**Interfaces:**

- Consumes: a target homepage URL
- Produces: a non-zero exit before the fix and zero after the fix

- [ ] **Step 1: Update the focused Vitest expectation before production code**

Require a neutral em dash in the initial meter, forbid `animatePublicStatNumber`, and forbid public-stats loaded-state animations. This is a small source regression guard; browser behavior remains the acceptance test.

- [ ] **Step 2: Write the real-browser test**

For a delayed successful `/api/public-stats` response, assert that the badge stays visible at opacity `1` with transform `none`, retains the same bounding box, and changes text exactly once from `—` to `9,876+`. For a failed response, assert that the badge remains visible with `—` and ends with `aria-busy="false"`.

- [ ] **Step 3: Verify RED**

Run the focused Vitest file and browser test against the unmodified page.

Expected: failure because the current page uses `...`, hides and transforms the badge, animates many intermediate values, and hides the badge on API failure.

### Task 3: Implement the Stable Atomic Meter Update

**Files:**

- Modify: `src/components/HomeLanding.astro`

**Interfaces:**

- Consumes: `{ totalGenerations: number }` from `/api/public-stats`
- Produces: one localized formatted number update without changing badge geometry or visibility

- [ ] **Step 1: Make the initial slot stable**

Render `—` inside a right-aligned `8ch` numeric slot so the badge width is reserved before the API responds.

- [ ] **Step 2: Replace animated updates with one assignment**

Delete `animatePublicStatNumber`. Call `setPublicStatNumber` once for a valid count, then set `aria-busy="false"`.

- [ ] **Step 3: Keep the fallback on invalid data or failure**

Set `aria-busy="false"` without hiding, moving, or clearing the badge.

- [ ] **Step 4: Remove loaded-state animations**

Delete the badge/number loaded-state animation declarations and their keyframes.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/components/__tests__/HomeLandingPerformance.test.ts
```

Then run the real-browser test against the local built preview. Expected: both success and failure cases pass.

### Task 4: Measure, Verify, and Ship

**Files:**

- Create outside repository: `/tmp/autolister-home-after.json`

**Interfaces:**

- Consumes: the Vercel preview URL containing the implementation
- Produces: an exact before/after comparison and a verified production-ready commit

- [ ] **Step 1: Run the full production verification gate**

Run:

```bash
npm run verify:production
```

Expected: lint, type-check, build, format check, and all tests pass.

- [ ] **Step 2: Deploy a Vercel preview**

Deploy without changing production, then verify the homepage returns HTTP 200.

- [ ] **Step 3: Run the identical after benchmark**

Run:

```bash
node /tmp/autolister-home-benchmark.mjs <preview-url> after
```

Expected: ten successful cold visits and `/tmp/autolister-home-after.json` using the same scenarios and aggregation as the baseline.

- [ ] **Step 4: Compare exact results**

Report a concise table covering desktop and throttled mobile FCP, LCP, total blocking time, CLS, meter visual updates, width movement, vertical movement, minimum opacity, and settling time.

- [ ] **Step 5: Commit and push only after evidence passes**

Commit the production and test changes, then run:

```bash
npm run push:production
```

Expected push proof: `main -> main` for `quick-vint-api`.
