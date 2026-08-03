# AutoLister 1.4 Launch Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cinematic, product-led AutoLister 1.4 release page using real screenshot stages and proven motion libraries.

**Architecture:** Keep screenshot availability and placeholder guidance in one small Astro component. Build the release narrative in one Astro page and let GSAP ScrollTrigger own all pinning/scrubbing; use Atropos only for pointer depth.

**Tech Stack:** Astro 5, GSAP 3.13+, ScrollTrigger, SplitText, Atropos 2, Fontsource variable fonts.

## Global Constraints

- Do not publish or deploy.
- Do not invent product UI, metrics, or imagery.
- Respect `prefers-reduced-motion`.
- Preserve the exact `/updates/1-4-0` route and screenshot filenames.

---

### Task 1: Proven motion and typography dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Install `gsap`, `@fontsource-variable/inter`, and `@fontsource-variable/inter-tight` with pnpm.
- [ ] Confirm the existing `atropos` dependency remains the only pointer-parallax dependency.

### Task 2: Reusable product screenshot stage

**Files:**

- Create: `src/components/updates/ReleaseScreenshot.astro`

- [ ] Accept `src`, `file`, `label`, `guidance`, and `alt` props.
- [ ] Check screenshot availability at build time.
- [ ] Render either the real image or an exact capture placeholder inside valid Atropos structure.

### Task 3: Rebuild the launch story

**Files:**

- Modify: `src/pages/updates/1-4-0.astro`

- [ ] Replace custom scroll progress code with GSAP ScrollTrigger pin/scrub timelines.
- [ ] Build one wardrobe hero/product takeover, two pinned feature chapters, and one closing CTA.
- [ ] Use SplitText for masked line reveals and Atropos for restrained desktop pointer depth.
- [ ] Import Inter Tight for display type and Inter for body copy.
- [ ] Add reduced-motion and mobile layouts without blank scroll states.

### Task 4: Rendered visual gate

**Files:**

- Modify only if visual evidence exposes a defect: `src/pages/updates/1-4-0.astro`

- [ ] Inspect desktop screenshots across every pinned timeline and both handoffs.
- [ ] Inspect mobile opening and each feature chapter.
- [ ] Verify zero console errors and zero horizontal overflow.
- [ ] Keep the dev server running and hand over `http://localhost:4321/updates/1-4-0`.

### Task 5: Reuse the wardrobe mascot in the opening

**Files:**

- Copy: `../quick-vint/images/wardrobe-rewrite-character.webp` to `public/updates/1-4-0/wardrobe-rewrite-character.webp`
- Modify: `src/pages/updates/1-4-0.astro`

- [x] Render the existing transparent mascot as a decorative hero element with empty alt text.
- [x] Anchor it lower-left on desktop, scale it down on laptops, and place it beneath the CTA on mobile.
- [x] Add it to the existing hero GSAP timeline so it exits with the hero copy before the screenshot takeover.
- [x] Visually inspect desktop and mobile captures for text overlap and horizontal overflow.
