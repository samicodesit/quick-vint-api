# Direct first-item entry, November 17, 2026

Status: local feature branch `fix/direct-first-item-entry`, based on `fec9872`. Not deployed. No provider spending, real emails, real customer creation, marketplace actions or payments.

## Behavior

- Normal `/app` and explicit `/app?signin=1` visits show sign-in directly. The public landing pages keep their existing content and destinations.
- Desktop pairs sign-in with an illustrative draft based on the pictured black dress. The example includes a title, descriptive sentence, four factual bullets and relevant hashtags. It invents no brand, size, composition or condition.
- On phones and tablets below 960px, sign-in comes first and the complete example follows it. The Google and email actions fit in the initial viewport at every tested locale, including 320x568.
- Email entry shows the destination, one instruction covering link and code, one labeled field, Resend email and Change email. Initial success text, the offer and legal links do not repeat on this step. Six digits trigger verification; partial-code Enter does not navigate or put a code in a URL. Existing callback and OAuth logic remain in use.
- An empty authenticated workspace opens Add item. Saved drafts, imports and browser history still restore. Saved account preferences and distinct batch settings are preserved. Legacy pre-auth style choices migrate once through Google, code or email-link sign-in.
- Models load silently. Unseen invitations and old pending model choices never open a popup or trigger an invitation write. Explicit model setup and existing enabled-model photos remain usable, with the existing quota guard.

## Validation

- Final repository production gate: lint, type checking, production build, formatting and tests pass with first-use and legacy browser suites enabled: 1,804 passed, 5 unrelated opt-in tests skipped. The default suite also passed separately (1,789 tests).
- Explicit first-use and legacy-style browser suites: 15 passed. Includes Google/code/link restoration, model choices across modal and settings, saved defaults, ChatGPT import, mobile pricing links, and 72 locale/viewport combinations (18 locales at 320, 390, 768 and 1440px).
- Direct-entry browser journey: keyboard order, initial email failure and recovery, resend, change email, invalid code and recovery, Enter protection, fresh-account upload and generation, draft restoration, distinct account/batch preferences, manual model setup and Google OAuth handoff pass.
- Existing full local draft browser suite: 26 checks pass, including durable storage, image editing, queueing, quota, paywalls, checkout recovery, copies, deletion and mobile account/settings controls. Zero browser errors.
- Existing model-photo lifecycle and allowance browser journeys pass against the built app. Ready/failed/partial/skipped behavior and exhausted allowance remain covered.
- Browser network responses are isolated fixtures. This verifies the actual built UI and client behavior, not current provider availability, email delivery or payment conversion.
- No public page, canonical configuration, robots file or sitemap configuration changed. `/app` and its callback retain `noindex, nofollow` and their existing sitemap exclusions. Public SEO regression tests pass.
- Form text and control borders have sufficient measured contrast against their backgrounds. Keyboard order, visible labels, focus styles, numeric input mode, one-time-code autocomplete and live verification/error feedback are retained. No claim of a complete WCAG certification.

## Review

Actual before and final screenshots are retained in this directory. `signin-desktop.png` and `signin-mobile.png` show the complete entry, `email-code-*` the compact code step, and `first-item-*` the destination after authentication. `first-draft-*` shows the resulting local draft with fixture output.

Initial draft was rejected by the owner because its example lacked proper listing structure and pushed mobile sign-in down. Final layout puts authentication first on mobile, shows the full structured example and removes redundant code-step text. Copy review rejects redundant helper text; no extra setup instruction or model invitation was added.

References: [Google sign-in UX](https://developers.google.com/identity/siwg/best-practices), [Supabase email template token/link support](https://supabase.com/docs/guides/auth/auth-email-templates), [WAI labels](https://www.w3.org/WAI/tutorials/forms/labels/), [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing). These support implementation choices, not a promise of higher conversion.
