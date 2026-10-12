# Web checkout and primary paywalls

The web app uses the extension's primary free-trial, daily, monthly, Business top-up and account-pause rules. Temporary burst, authentication, service and inactive-account failures do not show paid options. Payment failures open the existing billing portal. Prices and standard plan limits come from authenticated usage data, not a separate pricing configuration. Existing discounts remain available in Stripe; extension rescue-offer timing was not added to this release.

The native dialog follows the existing content-component reference, with larger phone type, plan cards, visible recurring versus one-time prices and instant dismissal. It mounts on first use. Free accounts can view plans before exhaustion. Locked settings open the same authenticated app flow. Stripe returns to the saved local editor. Successful return reads poll briefly when the webhook has not updated exhausted usage yet; the browser never grants access from a URL parameter.

One-time web credit purchases reuse the existing mobile checkout endpoint, customer ownership checks and credit-pack webhook. Subscription checkout still sends existing subscribers to the portal. The legacy extension checkout branch, quotas, generation and image handling are unchanged. No database migration or new service is required.

## Verification

- The browser regression first failed because exhausted quota had no paid-options dialog. It now passes all 18 local-draft journey checks, including targeted free, Starter daily/monthly, Pro, Business and paused states, no generation request after quota, no paywall for bursts, a failed checkout retry and cancellation back to the same item. Stored drafts and photos remain intact.
- Phone dialogs fit 320x568, 360x640 and 390x844. The first paid option remains visible on short screens; necessary scrolling stays within the dialog. The saved screenshots were inspected. All five settings-discovery browser scenarios pass with pointer and keyboard plan locks.
- Endpoint regressions first failed on missing credit-pack support and missing authoritative usage-denial reasons, then passed. They check bearer ownership despite conflicting client identity, fixed app return URLs and a one-time pack for existing paid subscribers. Existing subscription, customer-recovery and webhook pause-clearing tests pass.
- A propagation regression first demonstrated successful usage reads returning stale exhausted quota. The corrected helper retries those reads within the existing four-attempt bound and returns only backend-confirmed usage.
- Full production verification passed 892 tests before the final propagation regression. The guarded production push runs the final complete gate again. An initial run caught unnecessary dialog allocation at startup, corrected by lazy mounting. A concurrent cold phone-upload import exceeded the pre-existing five-second test timeout; the targeted rerun and subsequent full gate passed without relaxing that test.

Live Stripe opening and cancellation will be checked after the READY deployment. No payment, new account or live customer generation is part of this verification. Physical iOS/Android payment completion remains untested.

The 320px visual inspection identified a badge collision with the plan limits. A bounding-box assertion reproduced it. Constraining the badge to its available column makes it wrap cleanly; the complete 18-step browser suite passes with the collision check at 320px, 360px and 390px.
