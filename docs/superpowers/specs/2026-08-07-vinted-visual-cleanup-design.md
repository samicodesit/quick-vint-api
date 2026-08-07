# Vinted visual cleanup design

**Date:** 7 August 2026

## Goal

Reduce unnecessary Vinted trademark and screenshot exposure without weakening AutoLister's product demonstrations.

## Considered approaches

1. Remove every Vinted-related screenshot. Lowest legal exposure, but unnecessarily removes useful product proof.
2. Keep everything and rely on referential use. No product work, but leaves unnecessary branding after a cease-and-desist notice.
3. **Selected:** replace the standalone logo image and crop only Vinted's header/logo from product screenshots while preserving AutoLister UI.

## Changes

- Replace the homepage `feature-2.avif` phone displaying the Vinted logo with an AutoLister-owned phone-upload visual.
- Remove the Vinted header/logo from `cws-screenshot-main.png` while preserving its required 1280×800 canvas and all AutoLister controls/copy.
- Remove the same header/logo from `blog-vinted-description-workflow.jpg`; it is a separate duplicated asset and must be updated independently.
- Leave `cws-screenshot-secondary.png` and `video-poster.webp` unchanged because they do not visibly display the Vinted logo.
- Leave `vid-promo.mp4` unchanged; the user will handle the moving/zooming video crop.

## Validation

- Inspect all changed assets at full size.
- Confirm no Vinted logo/header remains in the changed assets.
- Confirm AutoLister UI and marketing copy remain legible.
- Confirm `cws-screenshot-main.png` remains exactly 1280×800.
- Build the site once to catch broken asset references.

## Scope boundary

This change covers raster imagery only. Text claims, competitor comparisons, extension behavior, and the demo video are tracked separately in `docs/vinted-legal-response-checklist.md`.
