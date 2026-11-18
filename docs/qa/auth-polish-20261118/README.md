# Sign-in and verification refinement, November 18, 2026

Status: local draft, not deployed. Supersedes the November 17 estimates and single-box code presentation.

## Visible result

- Six visual digit slots backed by one labeled native text input. Numeric keyboard, `autocomplete="one-time-code"`, whole-code paste, leading zeroes and native selection remain supported. Verify code and Enter submit explicitly. Typing or autofill does not submit.
- **Open the link** stays bold in every interface language. The input is writable before receiving focus after email delivery. Active, selected and invalid slots have distinct visible states, including forced-colors support.
- A clock identifies writing time, an eye identifies views, a heart identifies favourites, and a timer identifies time to sell. Remove the progress bars. Compare 5 minutes by hand and 1 minute with AutoLister side by side, with 4 minutes saved as the main number.
- Supporting example: 50–100 views, 3–8 favourites and 24–48 hours to sell. The visible caption scopes these as example estimates for an in-demand item priced to sell. Views and favourites describe the example listing, without the contradictory seven-day window on an item sold earlier.
- Desktop keeps the form alongside the figures. Mobile keeps the full sign-in form first and hides the estimates during code entry. No additional setup, model prompt or helper filler.

## Numbers and sources

These are owner-authorized illustrative scenario assumptions, not measured AutoLister averages, marketplace averages, a sales guarantee or evidence of an uplift caused by AutoLister. The views range has no public aggregate benchmark. Do not describe it as researched or measured. Writing-time arithmetic remains the explicit 5-minute versus 1-minute assumption.

[PLOTT's current dashboard](https://vinted.plottdata.com/app) reports sale times in hours for several clothing categories in its newly listed sample. Its [methodology](https://vinted.plottdata.com/methodology) follows listings for 14 days. Sale-time summaries exclude unsold listings, and its sale-time histogram and reported medians do not reconcile, so do not borrow a precise average. This supports only the plausibility of a fast-sale example, not its typicality.

[FLUF's primary UK sample](https://fluf.io/tools/what-sells-best-on-vinted/) reports roughly 3–8 weekly favourites for some in-demand brands, substantially below that for many common brands. This informs the favourable-item scenario only. It does not establish 3–8 favourites within 24–48 hours. These sources cannot substantiate the chosen views, favourites or sale-time estimates as a combined observed outcome. The previous 7–14-day number also lacked that support and has been removed at the owner's direction.

The separated-slot treatment follows the [accessible OTP pattern](https://ui.shadcn.com/docs/components/base/input-otp) without adding a dependency. Native [one-time-code autocomplete](https://developer.apple.com/documentation/security/enabling-password-autofill-on-an-html-input-element) enables supported browser/OS suggestions. Actual iPhone Mail suggestion presentation has not been physically tested and is not guaranteed by a web attribute.

## Verification

- Mouse and touch fixture journeys pass: email failure/retry, code focus, six-slot mirroring, clipboard paste, leading zero, Backspace, click/tap digit replacement, simulated autofill change, Verify code and Enter, invalid-code recovery, service retry, duplicate submission prevention, resend/change email, upload/generation and restored defaults.
- All 18 interface languages at 320, 390, 768 and 1440px pass both sign-in and code layout checks. No horizontal overflow; phone sign-in actions remain in the first viewport. This covers 72 viewport/locale combinations in each state.
- Actual built desktop and phone screens inspected. Before views retained from November 17. Current screenshots in this directory are the actual local fixture application, not mockups.
- Full production gate passed: lint, type checking, build, formatting, 1,804 tests passed and five unrelated opt-in tests skipped. This includes 15 enabled first-use/legacy browser cases. Result recorded in `verification.json`. No production deployment, real email, purchase, provider generation or live marketplace action. Public indexable pages and SEO configuration are unchanged.
