# AutoLister 1.4 Launch Page Design

## Job

Show existing users what materially changed in AutoLister 1.4, make the release feel important, and send them back to Vinted. The page opens only for the 1.4.0 extension update and must remain a local preview until explicitly published.

## Direction

Use a proven pinned product-story structure: a restrained opening statement gives way to the real wardrobe interface, which expands from a floating glass window into the main stage. Two quieter pinned chapters then explain phone/batch uploads and review-first suggestions. The page ends with one direct action.

The signature moment is the real wardrobe screenshot taking over the viewport during scroll. The opening also reuses the extension's existing wardrobe-rewrite character as a supporting accent: lower-left on desktop and beneath the CTA on mobile. It leaves with the hero copy before the screenshot takeover.

## Visual system

- Ink: `#11102f`
- Electric indigo: `#5146e5`
- Aqua: `#24cdb4`
- Cloud: `#f7f7fb`
- Hairline: `#d9dcff`
- Paper: `#ffffff`
- Display: Inter Tight Variable, 650–780
- Body: Inter Variable, 400–650
- Utility labels: native monospace stack

No fake UI, decorative SVG scenes, fabricated metrics, or unrelated stock imagery. Reuse the exact transparent `wardrobe-rewrite-character.webp` asset rather than generating another mascot. Until the three real screenshots are supplied, show exact filename and capture guidance inside clearly intentional product-frame placeholders.

## Motion

- GSAP ScrollTrigger owns pinning and scrubbed timelines.
- GSAP SplitText masks accessible headline lines for the opening reveal.
- The already-installed Atropos library provides restrained pointer depth only on product frames.
- Native scrolling remains intact; no smooth-scroll hijacking.
- `prefers-reduced-motion` shows the complete static composition without pinning or transforms.

## Content sequence

1. “Your wardrobe, rewritten.” with a direct Vinted action.
2. Wardrobe screenshot expands into the viewport; supporting copy explains multi-listing rewrite.
3. Phone/batch screenshot and copy explain immediate uploads and adding more in waves.
4. Review-first screenshot and copy explain that nothing changes until the user chooses.
5. “Version 1.4 is ready.” with the same direct action.

## Responsive behavior

Desktop uses pinned scrubbed chapters. The mascot scales with `clamp()` and stays outside the centered copy. Mobile places it in normal flow beneath the CTA so it cannot overlap text. Mobile uses shorter pinned sequences with readable type and product frames sized inside the viewport. Atropos pointer tilt is desktop-only. There must be no horizontal overflow, unreadable text, or blank scroll screens.

## Verification

Inspect the actual rendered page in headless Chromium at the opening, midpoint, handoff, and final state on desktop and mobile. Confirm no console errors, no overflow, no invisible required content, and coherent reverse scrolling. Do not publish.
