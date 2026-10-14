# Mobile paid-options selection and Google branding

## Changes

- Paid plan cards are native radio choices. The first permitted choice is visibly selected. Selecting or using arrow keys changes only the choice, never starts checkout.
- A separate `Continue with [choice]` button opens the existing bearer-owned Stripe checkout. One-time credits display one-time purchase reassurance. Payment recovery remains an explicit `Update payment` action using the existing portal.
- The dialog has a bounded scrolling body and a fixed footer within the dialog. The CTA remains visible on short phones. No new dependencies, database tables, requests on selection, or pricing/eligibility rules.
- Closing a pending paywall invalidates its navigation attempt. Failed checkout preserves the selected choice and offers retry.
- Google OAuth client `auto-lister-ext-supabase` was matched against the production Supabase authorize redirect. App display name was `auto-lister-ai`, status Testing, and privacy/terms URLs used obsolete `.html` paths. Saved AutoLister as the name, switched to Production with explicit user confirmation, and retained existing email/profile scopes, credentials, origins and callback URLs.
- The first automated Google branding check rejected the old privacy URL as unresponsive. Corrected the policy URLs to `/privacy` and `/terms`. The policy now explicitly covers the web app and Google's basic sign-in data.

## Design evidence

The supplied phone screenshot showed a highlighted first card with no separate action. Clicking cards immediately opened Stripe. Selection and submission now have distinct controls.

- [NN/g radio selection guidance](https://www.nngroup.com/articles/radio-buttons-default-selection/) supports a visible default and a separate submission action.
- [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) requires verified, published branding before the app name/logo replaces the unverified identity.
- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google) describes branding verification and optional custom domains. No paid custom domain was purchased.

## Verification

The permanent actual-browser suite was first run against the old UI and failed because it had no radio choices. The revised UI and expanded rerun passed all 24 browser flow checks, including native keyboard selection, one checkout for a double tap, and payment recovery through the portal. Screenshots at 320/360/390px were inspected. Release verification is recorded below when complete.

Browser API/auth/Stripe responses are intercepted fixtures, not customer purchases. Physical iOS Safari and a live purchase remain untested. Google approval is an external result, not established by a website deployment.

## Live acceptance

- Guarded `npm run push:production`, with real generation browser integration enabled, passed lint, types, build, formatting and 956 tests in 129 files. `origin/main` moved from `0122f68` to `dcd9d2a`. The newer telemetry commit was preserved.
- Vercel deployment `EMUFMBMCPjsGWJ2xcuNCmCyt2W3N` reached Ready at October 14, 2026, 19:47:36 GMT+2 and serves `autolister.app`.
- The same 24 actual-browser flow checks passed against the deployed assets, with all API, auth and Stripe responses intercepted. Native radio selection produces no checkout request, keyboard arrows update the CTA, double taps produce one checkout request, retry retains the chosen credit pack, and payment recovery uses the portal.
- Google's second branding verification succeeded against the corrected live policy. Published the verified branding. Google's status reads: "Your branding has been verified and is being shown to users."
- A fresh production Supabase Google authorization request, stopped at the account chooser without selecting an account, visibly showed the AutoLister logo and "to continue to AutoLister", with `/privacy` and `/terms` links. No paid custom domain, new credential, changed scope or callback was needed.
- Minimal screenshot and result evidence: `C:/Users/Sami/.codex/visualizations/2026/10/14/autolister-paywall/`. Google screenshot is cropped to the heading/logo to exclude account identifiers. The exact live paywall screenshots at 320px and 390px were inspected.
