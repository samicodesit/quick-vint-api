# Uninstall Character Generation Reference

Use this when generating more assets that should look like the same character used on the AutoLister uninstall winback page.

## Existing Reference Asset

- Current production asset: `public/uninstall-winback-character.webp`
- Current usage: `src/pages/uninstall.astro`
- Original implementation notes: `docs/superpowers/plans/2026-07-30-uninstall-winback-character.md`

Always use `public/uninstall-winback-character.webp` as the primary reference image. Do not generate from prompt alone if the goal is character consistency.

## Character Identity

Preserve these traits as closely as possible:

- Modern young adult seller-assistant character.
- Androgynous / broadly gender-neutral presentation, leaning softly human and stylish rather than cute.
- Short dark wavy hair.
- Warm, calm face with a thoughtful expression.
- Clean dark jacket over a light neutral shirt.
- Minimal accessories, no brand marks.
- Polished 3D app-store illustration style.
- Soft rounded forms, realistic enough to feel premium, not childish or toy-like.
- White / transparent-friendly web asset look, suitable for a clean SaaS page.

Avoid:

- Cartoon mascot styling.
- Childlike proportions.
- Anime exaggeration.
- Animal-like features.
- Heavy makeup, glam styling, or overly gendered fashion.
- Busy backgrounds, logos, text, watermarks, or random props.
- Changing face, hair, outfit, or body proportions more than necessary.

## Reusable Prompt

Use this as the base prompt when asking image generation to create a new pose/action:

```text
Use case: stylized-concept
Asset type: web page character asset for AutoLister AI
Reference image: Use public/uninstall-winback-character.webp as the identity and style reference. Preserve the same character identity, face, short dark wavy hair, dark jacket, light neutral shirt, calm thoughtful personality, proportions, and polished 3D app-store illustration style.

Primary request: Create the same character doing <NEW ACTION OR POSE>.

Subject: The same modern young adult seller-assistant character from the reference image. Keep the character broadly gender-neutral, warm, professional, calm, and appealing to Vinted sellers. The character should feel premium and human, not childish, not cartoonish, not mascot-like.

Style: polished app-store quality 3D illustration, clean white-webpage-ready lighting, soft rounded 3D form, tasteful, warm, modern, realistic enough to feel premium.

Composition: full character or upper-body composition as needed, generous padding, front three-quarter view unless the requested action needs another angle. Keep edges clean for background removal and web placement.

Background: perfectly flat solid #00ff00 chroma-key background for background removal. No shadows, gradients, texture, floor plane, text, watermark, logo, or brand marks. Do not use #00ff00 anywhere in the subject.

Negative guidance: Do not redesign the character. Do not change hairstyle, clothing style, age, facial identity, or illustration style. Do not add extra characters.
```

Replace `<NEW ACTION OR POSE>` with a specific action, for example:

- sitting and holding a coupon ticket
- pointing toward a call-to-action button
- leaning beside a stack of folded clothes
- looking at a phone with a small thoughtful smile
- holding one Vinted-style listing card without any logo or text
- waving gently as a farewell illustration

## Background Removal

For transparent assets, prefer the built-in image generation flow with a flat chroma-key background, then remove the background locally:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input <generated-source> \
  --out /private/tmp/<asset-name>.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

If edges look too green, retry once with `--edge-contract 1`.

## Export

Prefer WebP for production page assets:

```bash
sips -s format webp -s formatOptions 82 -z 520 520 /private/tmp/<asset-name>.png --out public/<asset-name>.webp
```

If WebP export is not available, use a compressed PNG and update references accordingly.

Suggested naming:

- `public/uninstall-character-pointing.webp`
- `public/uninstall-character-thinking.webp`
- `public/uninstall-character-phone.webp`
- `public/uninstall-character-coupon.webp`

Do not overwrite `public/uninstall-winback-character.webp` unless explicitly replacing the production uninstall page asset.

## Quality Checklist

Before using a generated asset:

- Compare it against `public/uninstall-winback-character.webp`.
- Confirm the face, hair, outfit, and overall style still read as the same character.
- Confirm transparent edges are clean.
- Confirm it works on a white or near-white page background.
- Confirm it does not include text, logos, watermarks, or unintended props.
- Confirm file size is reasonable for web use.

## Limitation

There is no saved model seed or permanent character ID. Exact identity cannot be guaranteed from prompt alone. The best consistency comes from using the current WebP as a reference image and keeping the prompt strict about preserving identity, outfit, style, and proportions.
