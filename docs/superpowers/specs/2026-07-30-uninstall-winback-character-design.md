# Uninstall Winback Character Design

## Goal

Improve `/uninstall` so users who remove the Chrome extension see a warmer, more memorable winback page without reducing clarity. The page should still make the two core actions obvious:

- copy/use the `LISTFASTER20` offer and reinstall;
- optionally give one-tap uninstall feedback.

## Current Flow

The extension sets Chrome's uninstall URL to:

`https://autolister.app/uninstall?version=<version>&cid=<analyticsClientId>&uid=<userId>`

The page currently shows a two-column layout:

- offer card with headline, coupon, reinstall CTA, pricing CTA, and trust notes;
- feedback card with short uninstall reasons.

This is functional but visually plain. The page feels like a form rather than a thoughtful recovery moment.

## Approved Direction

Use one polished 3D character asset around the coupon area.

The character should feel like a calm seller assistant, not a childish mascot. It should be gender-neutral and broadly appealing: soft 3D render, modern clothing, relaxed expression, sitting or leaning near a coupon/listing ticket. It should support the offer visually without becoming the main message.

## Visual Requirements

- Place the character inside the offer card near the coupon/ticket section.
- Keep the headline and coupon readable on desktop and mobile.
- Do not move the feedback reasons below a large hero image.
- Avoid childish, goofy, overly cute, animal-like, or toy-like styling.
- Avoid busy backgrounds and embedded text inside the generated image.
- Use transparent or easy-to-mask output, saved as a compressed web asset.
- Prefer a display size around 150-220px on desktop and smaller on mobile.

## Motion

Add a subtle entrance animation when the page loads:

- fade in;
- translate up slightly;
- settle with a gentle scale.

After entrance, use either no idle animation or a very subtle float. Respect `prefers-reduced-motion` by disabling movement.

## Localization

No new required user-facing text is planned. Existing localized copy remains unchanged.

## Implementation Notes

- Generate the character as a project asset under `public/`.
- Update `src/pages/uninstall.astro` to render the asset in the offer card.
- Add CSS for responsive placement and animation.
- Keep tracking behavior unchanged.
- Keep coupon and CTA DOM stable enough for existing analytics and tests.

## Testing

- Add or update page tests to assert the character asset is present on `/uninstall`.
- Run backend test/build checks that cover the page.
- Visually verify `/uninstall?preview=1` on desktop and mobile with screenshots.

## Success Criteria

- The page looks more premium and emotionally warm.
- The coupon remains immediately understandable.
- Feedback remains visible and easy to tap.
- Mobile layout is not cramped and does not become a full hero image.
- The generated asset is optimized and does not noticeably bloat the web app.
