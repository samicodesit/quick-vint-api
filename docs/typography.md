# Product typography

Use `--autolister-font-ui` for interface text, branding, forms and controls.
It resolves to the self-hosted variable font **AutoLister Geist**, followed by
native system fonts as a resilient fallback. The family is namespaced to avoid
colliding with marketplace styles. Newsreader remains the intentional exception
for large web-app display headings. Keep monospace for code and identifiers.

This choice follows a November 2026 comparison of native Windows typography and
Geist in the same real onboarding form. Native fonts were usable, but Geist gave
more predictable letterforms and intermediate weights across platforms. The
small download is an intentional tradeoff for that consistency.

## Size and hierarchy

| Role                                            | Target                                        |
| ----------------------------------------------- | --------------------------------------------- |
| Reading text and editable fields                | 16px, with 1.5 line height for paragraphs     |
| Standard UI labels and actions                  | 14px                                          |
| Compact preference choices and consequence text | 13px minimum                                  |
| Supplementary metadata and badges               | 11–12px, never the only essential instruction |
| Dialog headings                                 | 22px on phones, 24px on larger screens        |
| Large app display headings                      | Existing Newsreader scale, usually 30–40px    |
| Website hero                                    | Responsive 32–60px, weight 700                |

These are role-based targets, not a blanket override of every existing component.
Model preference labels and consequences now follow the compact targets; model
height entry uses 16px. Use rem units for new model typography. Listing-style
onboarding now uses 14px controls and 16px example text. Do not shrink core labels to
fit a translation; allow wrapping and test the narrow layout.

## Delivery

The shared web definition lives in `public/typography.css`. Bundled styles import
it; standalone pages load it directly. Web font URLs are absolute so bundling
does not create a second URL for the same preloaded font. The extension keeps the
same font faces in `lib/typography.css`, with relative URLs to its packaged files.
Its typography selectors are scoped to AutoLister surfaces, preserving the
marketplace's own text.

Fonts are WOFF2 variable files with all supported weights in one file per script.
The Latin file is 29,400 bytes (28.7 KiB). Latin Extended, Cyrillic, Cyrillic
Extended and Vietnamese subsets load only when their Unicode ranges are used.
All five font files total 76,420 bytes in the extension package. They require no
third-party font service or font network downloads after extension installation.

The site layout and web app preload the same Latin URL referenced by CSS.
Newsreader remains locally hosted. Compared with the original three-family app,
Inter Tight's 44,872-byte Latin preload remains removed. The previous native-only
draft saved more bytes; it has been superseded by this typography review.

Hashed font filenames identify immutable asset contents. Retain the bundled SIL
Open Font License in `fonts/geist-OFL.txt`. Font sources came from the existing
`@fontsource-variable/geist` dependency, without adding a package.

## Review evidence

Current Windows Chrome screenshots are in the session visualization folder under
`type-review/`. These are local drafts. No deployment or live marketplace flow
is implied. In-app browser captures with scaling or cropping artifacts were
rejected; desktop and phone dimensions were checked against actual CSS viewport
dimensions in Chrome.

The model form and listing-style onboarding were checked for horizontal overflow
at 320 and 390 CSS pixels.
Small option labels are 13px, group labels 14px, and the consequence text has a
5.02:1 contrast ratio against white. This is targeted visual and layout checking,
not a claim of complete WCAG conformance.
