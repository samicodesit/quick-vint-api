# Homepage Cold-Load Stability Design

## Goal

Make the AutoLister homepage immediately usable and visually stable on a visitor's first load, with particular focus on the public listings meter above the hero video.

## Evidence

A real Chromium profile against `https://autolister.app/` used a new browser context, cleared cookies and storage, disabled the browser cache, and blocked service workers.

- Desktop reached first contentful paint in 248 ms with 0 ms total blocking time, but the meter disappeared, changed width, moved vertically, and updated about 25 times before settling around 1.6 seconds.
- Throttled mobile at 4× CPU slowdown and simulated 4G reached first contentful paint in 700 ms and largest contentful paint in 956 ms with 78 ms total blocking time, while the meter kept animating until about 2.2 seconds.
- The 4.2 MB demo video was already deferred until after page load and did not create blocking work in the measured first-interaction window.

The root cause is the meter's post-fetch behavior: a 1.4-second request-animation-frame count, followed by badge and number entrance animations that restart opacity and transform after the badge is already visible. Its content-sized container also changes width as the number changes. On request failure, hiding the badge creates another late visual removal.

## Design

Keep the deferred `/api/public-stats` request. Server-render the badge immediately with a neutral em-dash placeholder in a fixed-width numeric slot. When valid data arrives, format the final count and replace the placeholder once.

Remove the count-up loop, loaded-state entrance animations, and late badge hiding. The badge must retain the same opacity, transform, dimensions, and position before, during, and after the request. If the request fails or returns invalid data, mark loading complete and leave the neutral placeholder visible.

No API, database, analytics, hero layout, copy, or video-loading changes are included. The current performance profile shows no evidence that those paths delay first interaction enough to justify expanding this fix.

## Accessibility

Keep `aria-live="polite"` and `aria-busy`. The badge starts busy and changes to not busy after success, invalid data, or failure. The update happens once, preventing repeated announcements from the animated counter.

## Verification

Use the built site in real Chromium. Every run must create a new browser context, clear cookies and storage, disable browser cache, and block service workers.

1. Delay the stats response to prove the placeholder remains visible and stable while loading.
2. Return a valid count and prove the text changes exactly once to the localized formatted count.
3. Return an error and prove the badge remains visible with the placeholder.
4. Sample the badge through the load and assert unchanged width, height, top position, opacity, and transform.
5. Repeat on desktop and throttled mobile, then compare FCP, LCP, layout shift, long tasks, and total blocking time with the production baseline.
6. Run the repository's focused tests and full production verification gate.
