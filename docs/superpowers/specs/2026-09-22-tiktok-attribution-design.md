# Acquisition Attribution Design

## Goal

Measure whether a new AutoLister account that reaches the product through a tagged social entry point later signs in, activates, or pays, while keeping attribution bounded, first touch only, and free of personal identifiers.

## Scope

- The website captures a first-touch record from allowlisted UTM values or an allowlisted referrer hostname.
- The record contains only source, medium, campaign, content, a server-independent capture timestamp, and a referrer hostname.
- `/tiktok` is a short first-party entry path that redirects to the website with the fixed TikTok organic campaign values.
- The website persists the record in localStorage when available. Storage failure must not affect navigation, sign-in, or checkout.
- The auth callback submits the stored record to the fixed same-origin claim endpoint with the bearer token already present in the magic-link callback.
- The existing extension handoff payload and auth behavior remain unchanged. A claim timeout or failure never blocks the handoff.
- The API inserts a user's first attribution once. Later claims cannot overwrite it.
- Admin reporting groups only accounts whose attribution capture predates or is sufficiently close to account creation. Existing accounts that later visit a tagged link remain re-engagement evidence and are not counted as new acquisitions.
- Activation means at least one successful generation. Paid means an active paid profile at report time.

## Data contract

```ts
type Attribution = {
  source:
    | "tiktok"
    | "instagram"
    | "youtube"
    | "facebook"
    | "linkedin"
    | "reddit"
    | "google"
    | "direct"
    | "unknown";
  medium:
    | "organic_social"
    | "paid_social"
    | "referral"
    | "search"
    | "email"
    | "direct"
    | "unknown";
  campaign: string | null;
  content: string | null;
  capturedAt: string;
  referrerHost: string | null;
};
```

Campaign and content are lower-case slugs limited to `[a-z0-9._-]`, with a maximum length of 80. Source and medium are enum values. Referrer is a hostname only and must match a small allowlist. No URL, email, IP address, browser fingerprint, or arbitrary query parameter is stored.

## Reporting contract

`GET /api/admin?action=attribution-report&days=30` returns source and campaign cohorts plus TikTok and overall totals. Cohorts and totals expose `captured`, `newSignups`, `activated`, `activePaidProfiles`, and `nonNewClaims`; unknown profiles and cross-device limits are under `unknown`. A profile is counted as a new signup only when its stored `capturedAt` is on or before `created_at` plus 24 hours. The report never backfills users without a stored attribution, and marks the result as authenticated-client evidence rather than platform-verified TikTok proof.

## Failure and security rules

- Malformed or oversized records are rejected before persistence.
- The claim endpoint is fixed to `https://autolister.app/api/attribution/claim`; the callback sends only the sanitized attribution object and bearer token over same-origin HTTPS.
- The API uses the bearer token identity as the owner and ignores any client-supplied user id.
- Storage, network, and JSON failures are best effort and do not block login or generation.
- First-touch attribution is insert-only. A second claim returns success with `alreadyAttributed: true` without changing the original record.

## Release dependencies

1. Apply the Supabase migration before deploying API code that queries the new table.
2. Deploy the website and API so `/tiktok`, capture, claim, and admin reporting are live.
3. No extension release is required because existing auth handoff data and semantics are unchanged.
4. Verify the exact TikTok entry path, website claim, new account attribution, first generation, and admin cohort report with deterministic local tests and a controlled real account only when the operator explicitly chooses to run it.
