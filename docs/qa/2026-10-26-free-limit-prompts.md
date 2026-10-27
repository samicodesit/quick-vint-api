# Free-limit prompts, October 26, 2026

Prepared locally for user sign-off. No push, deployment, store upload or payment was performed.

## Product changes

- Web batch Resume now uses the same blocked-generation callback as a fresh generation. Exhausted free, daily and monthly quotas can open the existing paid-options dialog. Temporary throttling and unknown capacity keep the existing recovery message.
- Both free-limit prompts use the owner's shorter copy: **You’ve used all 5 free listings** and **Choose a plan or buy one-time credits to continue.** No new helper text, section, banner or modal was added.
- Free-limit headings and messages, checkout button/loading labels, close labels, plan comparisons and popularity badges use the existing billing translations. Web checkout errors are localized; extension checkout errors retain their existing server messages, including actionable sign-in instructions. Extension prices and limit units also follow the selected UI language. The same catalog covers all 18 supported billing languages.
- Prices, quotas, checkout destinations and discount-offer timing are unchanged.

French copy: **Vous avez utilisé vos 5 annonces gratuites**. **Choisissez un forfait ou achetez des crédits sans abonnement pour continuer.**

## Verification

- Shorter-copy follow-up: updated both matching 18-language catalogs and the extension fallback. Updated existing literal-copy assertions; no new product behavior. Reused the existing Resume/paywall browser fixture across all 18 languages at 320, 390 and 1440px, plus its one-time-credit view. Reused the existing extension translated-paywall check across all 18 languages in monthly/one-time modes at 320 and 390px. The 15 targeted paywall-policy tests pass. English, French, Greek and Hungarian rendered captures were visually inspected; text wraps without horizontal overflow and controls remain usable. Existing full-suite results below predate this copy-only follow-up and were not repeated.
- Independent copy review found one Lithuanian phrase that could imply only one purchase. It now explicitly says credits without a subscription, with the affected layouts rechecked. No other actionable wording finding. This review is not native-speaker certification of every translation.
- The extension check initially failed to start with the local Node 22/Playwright loader combination. The installed Node 24 runner passed; no dependency or product change was made to address that tooling mismatch. The first targeted unit run found the old French literal expectation; it was updated to the approved new wording and the rerun passed.

- A new local-browser regression failed before the Resume fix because the paid-options dialog never opened. After the fix it passes: blocked Resume consumes no generation and preserves saved draft records and the remaining queue; a temporary minute limit shows no paywall; restoring the allowance generates the original two items. English and French runs pass with no browser errors.
- The actual free-limit dialog was checked at 320px, 390px and 1440px. Monthly and one-time options remain usable. English and French screenshots were inspected for wrapping, prices, labels, controls and compact copy.
- The existing billing-browser suite passes all six checkout request combinations in each of 18 languages, plus narrow widths, keyboard tabs, Escape and the credit-entry path. All requests were intercepted local fixtures; no Stripe purchase was made.
- Twelve targeted extension paywall/offer tests pass, including one-time pack selection, checkout, checkout recovery, translated narrow layouts and suppression for expired/unknown capacity. The final full frontend gate passes: 157 unit tests, 331 browser tests with 3 existing skips, and `npm run build:prod`. Browser checks used four isolated workers, the reviewed backend path and no live Vinted flow.
- Backend `npm run verify:production` passes lint, types, build, formatting and 1,107 tests (13 intentionally skipped).
- The first full backend run exposed an unrelated expired October 21 timestamp in `eventsTrack.test.ts`. The fixture now uses a fresh timestamp while still asserting exact correlation. No event endpoint or retention behavior changed. The full gate passes after that test-only repair.
- The first extension run loaded the phone-upload page through a shared sibling symlink pointing at an older Orion backend checkout. Six phone-page recovery tests and three subsequent phone-network checks failed against that old page. The obsolete run was stopped and superseded. `phone-upload-page.spec.js` now honors the existing `AUTOLISTER_API_PATH` setting used by the other coordinated tests. All six phone-page tests pass against the reviewed backend `main`; no production phone-upload code changed. The final full extension gate uses that explicit backend path and isolated browser workers.
- Inline review confirms that the change replaces existing UI copy, keeps subscription versus one-time terms visible in their current locations, and introduces no redundant helper text. A subsequent owner-requested independent review found no blocking source issues. It checked Resume behavior, queue preservation, all 18 matching catalogs, retained French web/extension screenshots, unchanged billing terms and scope. Existing full-suite results were reused. The reviewer identified the checkout-error wording correction above and this review-status update; no additional product change was needed.
- The existing permanent duplicate-account exclusion regression in `generationAbuse.integration.test.ts` is separate work. Preserve it separately from the free-limit release scope.

## Reviewed captures

- [Web monthly, English, 390px](free-limit-20261026/web-monthly-en-390.png)
- [Web monthly, French, 390px](free-limit-20261026/web-monthly-fr-390.png)
- [Web credits, French, 390px](free-limit-20261026/web-credits-fr-390.png)
- [Extension monthly, English, 390px](free-limit-20261026/extension-monthly-en-390.jpg)
- [Extension monthly, French, 390px](free-limit-20261026/extension-monthly-fr-390.jpg)

## Release boundary

Reproduce the frontend gate with both local suites and the correct coordinated backend:

```bash
npm run test:unit
AUTOLISTER_API_PATH=/home/mests/projects/autolister/.worktrees/blog-web-app-entry npm run test:e2e -- --workers=4
npm run build:prod
```

Keep `AUTOLISTER_API_PATH` set to the reviewed backend checkout when running the guarded production push from this frontend worktree. The shared sibling symlink points at an older checkout.

This is source and local-browser verification, not evidence of production deployment or actual user impressions. The frontend changes are based on production `main` in `.worktrees/clear-free-limit-frontend` on `codex/clear-free-limit`; the backend changes are in the existing `main` worktree `.worktrees/blog-web-app-entry`. Existing unrelated workspace edits are excluded from this work. User sign-off is required before deploying the web changes or submitting the extension release.
