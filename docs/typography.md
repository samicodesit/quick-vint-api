# Product typography

Use `--autolister-font-ui` for interface text, branding, forms and controls. The
shared definition lives in `public/typography.css`; bundled styles import it and
standalone pages load it directly. The extension keeps the same stack in
`lib/typography.css`, scoped to AutoLister surfaces so Vinted keeps its own fonts.

The stack uses the device's native system font. It needs no font download and
renders consistently across AutoLister surfaces on the same device. Letterforms
can vary between operating systems. Keep monospace text for code and technical
identifiers.

Newsreader is the intentional exception for large web-app display headings. All
dialog headings, model preferences, labels and buttons use the UI font. Do not
add separate typefaces for small headings or badges.

The November 2026 consolidation removes the web app's Geist and Inter Tight
imports and preloads. Their Latin WOFF2 files total 74,272 bytes (72.5 KiB).
Newsreader remains locally hosted. The release page also stops importing Inter
and Inter Tight, and the admin and phone-upload pages stop requesting Google
Fonts. Font package removal is separate from runtime delivery; unused packages
are not loaded by these pages.

Model invitation headers use the existing localized `New` label in a compact
pill. The badge inherits the same UI font and the surface's existing accent.

Local desktop/mobile render evidence and request audits are saved in the parent
workspace at `reports/typography-20261101/`. Auth, billing, account and extension
screens use local fixtures or unauthenticated states. These screenshots do not
claim a production deployment or a live marketplace test.
