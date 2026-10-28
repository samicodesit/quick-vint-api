# AutoLister billing identity

Reviewed 2026-10-28. The owner approved AutoLister-specific branding after the
audit found SAMISOFT on credit-pack and subscription-upgrade charges.

- Checkout headings: AutoLister AI, set per session for extension and web
  subscription and credit-pack paths.
- Subscription bank statements: AUTOLISTER AI, configured on the AutoLister
  Stripe products. An explicit invoice descriptor takes precedence. Existing
  charges do not change retroactively.
- Credit-pack card payments: AUTOLISTER suffix. The shared account currently
  contributes SAMISOFT, producing SAMISOFT\* AUTOLISTER (20 characters).
  AUTOLISTER AI would exceed Stripe's 22-character combined limit.
- AutoLister emails already use AutoLister AI as sender and
  support@autolister.app as reply-to. Approved email content is unchanged.
- Stripe's receipt issuer and portal business identity remain account-level.
  The checkout heading override does not replace Sami Software Solutions in
  receipts or contractual identity. Do not rename the shared account or its
  legal owner as part of this application change.

The current stripe-node 18 SDK lacks the branding_settings type declaration,
but its default API version accepted and returned the exact field in sandbox
for both payment and subscription sessions. No SDK/API-version upgrade or
unsafe type assertion is required. Both unpaid sandbox sessions were expired;
no customer, purchase or subscription was created.

Endpoint tests cover all three checkout creation branches, correct card
suffixes, extension and web clients, and omission of payment-only parameters
from subscription sessions. The affected suites passed 43 tests after first
failing for the missing branding fields. The full production gate is required
by push:production.

Banks control the final statement presentation. Verify a subsequent real
payment's calculated descriptor before describing bank display as observed.

References:

- [Stripe statement descriptors](https://docs.stripe.com/get-started/account/statement-descriptors)
- [Checkout branding fields](https://docs.stripe.com/api/checkout/sessions/create?query=branding_settings)

Live setting readbacks and rollout evidence are kept in the parent workspace
under ops/evidence/billing-hardening-20261028.
