# Vinted Visual Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unnecessary visible Vinted branding from static marketing imagery while preserving AutoLister product demonstrations.

**Architecture:** Reuse the existing AutoLister phone-batch artwork for the homepage feature card. Deterministically crop only the Vinted header out of two composite screenshots while retaining their surrounding AutoLister marketing layout and original canvas dimensions.

**Tech Stack:** Astro, Tailwind CSS, FFmpeg.

## Global Constraints

- Do not modify `public/vid-promo.mp4`; the user will crop the moving video.
- Keep `public/cws-screenshot-main.png` exactly 1280×800.
- Preserve AutoLister controls, copy, product photos, and surrounding marketing layout.
- Add no dependency and generate no new UI with AI.

---

### Task 1: Replace the standalone logo photograph

**Files:**
- Modify: `src/components/HomeLanding.astro`
- Delete: `public/feature-2.avif`
- Reuse: `public/updates/1-4-0/phone-batch-upload.webp`

**Interfaces:**
- Consumes: existing homepage feature-card `<img>` markup.
- Produces: a homepage feature card using AutoLister-owned artwork with no Vinted logo.

- [x] **Step 1: Change the feature-card asset**

Replace `/feature-2.avif` with `/updates/1-4-0/phone-batch-upload.webp`, change the alt text to `AutoLister phone batch organizer`, and use `object-cover object-top` so the useful top of the tall interface fills the 4:3 card.

- [x] **Step 2: Confirm the old asset is no longer consumed or deployed**

Run: `rg -n 'feature-2\.avif' src`

Expected: no output. Delete `public/feature-2.avif` so the obsolete logo image is not publicly reachable.

### Task 2: Crop the Vinted header from static product screenshots

**Files:**
- Modify: `public/cws-screenshot-main.png`
- Modify: `public/blog-vinted-description-workflow.jpg`

**Interfaces:**
- Consumes: the current composite screenshots.
- Produces: same-page artwork with the embedded marketplace header removed and AutoLister UI retained.

- [x] **Step 1: Crop the header from the 1280×800 Chrome Store image**

Use FFmpeg to clear the embedded left screenshot, copy its content below the 64-pixel header upward, and preserve the surrounding 1280×800 canvas:

```bash
ffmpeg -y -i public/cws-screenshot-main.png -filter_complex "[0:v]split[base][source];[base]drawbox=x=23:y=16:w=798:h=784:color=white:t=fill[cleared];[source]crop=798:720:23:80[cropped];[cleared][cropped]overlay=23:16" -frames:v 1 /tmp/cws-screenshot-main.png
```

Then replace `public/cws-screenshot-main.png` with the reviewed `/tmp/cws-screenshot-main.png`.

- [x] **Step 2: Crop the duplicated blog image**

```bash
ffmpeg -y -i public/blog-vinted-description-workflow.jpg -filter_complex "[0:v]split[base][source];[base]drawbox=x=18:y=13:w=598:h=574:color=white:t=fill[cleared];[source]crop=598:521:18:65[cropped];[cleared][cropped]overlay=18:13" -frames:v 1 -q:v 2 /tmp/blog-vinted-description-workflow.jpg
```

Then replace `public/blog-vinted-description-workflow.jpg` with the reviewed `/tmp/blog-vinted-description-workflow.jpg`.

- [x] **Step 3: Visually inspect both images**

Confirm the Vinted logo/header is gone, AutoLister controls remain visible, and there are no seams or stretched content.

- [x] **Step 4: Verify dimensions**

Run:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 public/cws-screenshot-main.png
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 public/blog-vinted-description-workflow.jpg
```

Expected dimensions: `1280x800` and `960x600` respectively.

### Task 3: Validate and record completion

**Files:**
- Modify: `docs/vinted-legal-response-checklist.md`

**Interfaces:**
- Consumes: completed visual changes.
- Produces: checked legal-mitigation record.

- [x] **Step 1: Build the site**

Run: `npm run build`

Expected: exit code 0.

- [x] **Step 2: Update the checklist**

Mark the public-logo/copied-imagery item complete and note that the moving demo video remains assigned to the user.

- [x] **Step 3: Commit the implementation**

```bash
git add src/components/HomeLanding.astro public/feature-2.avif public/cws-screenshot-main.png public/blog-vinted-description-workflow.jpg docs/vinted-legal-response-checklist.md docs/superpowers/plans/2026-08-07-vinted-visual-cleanup.md
git commit -m "fix: remove Vinted branding from static imagery"
```
