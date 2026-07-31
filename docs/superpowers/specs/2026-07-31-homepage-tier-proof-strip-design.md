# Homepage tier proof strip

## Goal

Bring the uninstall page's plan selector and four value propositions into the homepage hero without removing or replacing any existing hero content. On desktop, the strip must be centered near the bottom of the initial viewport, remain clear of the existing content, and then dock into its reserved place in normal document flow as the user scrolls.

## Content

The strip keeps the uninstall page's Starter, Pro, and Business selector and the same four propositions. Homepage pricing uses standard monthly prices, not the uninstall-only 20% win-back discount.

| Tier | Price | ChatGPT Plus comparison | Included listings | Draft speed |
| --- | ---: | --- | ---: | --- |
| Starter | €3.99 | ~80% cheaper | 75 | Average 5 seconds |
| Pro | €9.99 | ~50% cheaper | 250 | Average 5 seconds |
| Business | €19.99 | Comparable price | 600 | Average 5 seconds |

The comparison label is localized as appropriate. Business must not claim a saving that does not exist at its standard price.

## Layout and behavior

- Keep the testimonial, bullets, CTAs, video, screenshots, and listings counter.
- Add a reserved proof-strip slot after the existing hero grid.
- On desktop, show the strip as a centered four-column rail with the plan selector attached above it.
- While the reserved slot is below the viewport, place the rail at the bottom center of the viewport with a comfortable edge gap.
- Reserve the rail's full height in the hero and add a matching safe area so it never covers existing hero content.
- When the reserved slot reaches the rail, switch the rail into the slot without a visible jump. Scrolling back above it restores the viewport position.
- Use one `IntersectionObserver` and CSS state classes for the handoff. If JavaScript is unavailable, the strip remains usable in normal flow.
- On mobile, do not float the strip. Render it in normal flow as a compact two-column grid beneath the hero content.
- Respect reduced-motion preferences and avoid entrance/count-up animations.

## Implementation boundaries

- Reuse the existing homepage component and localization structure.
- Do not extract or refactor the uninstall page as part of this change.
- Do not add dependencies.
- Keep plan switching client-side and update only text and the pricing link target.
- Preserve existing analytics, loading behavior, and first-paint optimizations.

## Verification

- Automated checks cover the three tier values, standard prices, non-discounted Business comparison, normal-flow fallback, and fixed-to-flow state hooks.
- Browser checks cover 1366×768, 1440×900, 1920×1080, a wide desktop viewport, and mobile.
- Visual inspection proves the strip is centered above the initial fold, does not overlap existing hero content, docks without a jump, and leaves the testimonial intact.
- Run the full production verification gate before pushing.
