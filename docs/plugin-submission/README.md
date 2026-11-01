# AutoLister public submission preparation

Updated 2026-11-01. Portal draft uploaded and Site update deployed privately.
Nothing submitted for review or published publicly.

## Product and identity

Keep the existing simple photo-to-draft flow. ChatGPT produces the initial text.
AutoLister imports the photos and text, then applies the enabled note stored for
the signed-in account in that browser. No marketplace login or separate
AutoLister OAuth connection is requested by the plugin. Opening the draft does
not invoke AutoLister's proprietary generation API. Using Regenerate later is
an ordinary AutoLister action subject to the account's plan.

Owner-approved listing: AutoLister, Productivity, all supported countries. The
publisher must be the actual identity verified by OpenAI. The signed-in Personal
organization now shows Verified (2026-11-01). The portal identifies the verified
developer as Individual: Sami Shata. The earlier Persona/status conflict is no
longer blocking uploads. The selected verified name was imported by the portal.

Preserve canonical plugin
`plugin_asdk_app_sites_6a8d7d35e5488191819b20e6e4651604` and App
`asdk_app_sites_6a8d7d35e5488191819b20e6e4651604`. The current Sites endpoint is
private and depends on Sites authenticating the caller. A caller-supplied
`oai-authenticated-user-id` header is not authentication on a raw public server.

## Prepared

- `listing-draft.json`: listing, prompts, five positive and three negative
  review cases, release notes and unrestricted country selection.
- Existing AutoLister brand icon copied into `assets/autolister.png`.
- Minimal additive policy/support source changes at existing URLs. Their new
  ChatGPT sections are local only. No homepage, canonical URL, pricing, or
  existing guide changes.
- Account-switch and cancellation regression tests in `chatItemImport.test.ts`.
  The import checks the current account before reading defaults, during image
  processing and before persisting, opening or acknowledging a draft.
- Independent abuse review and reproducible local browser flow evidence, linked
  in the preparation evidence folder. Local browser evidence uses fixture login
  and fixture transfer responses, actual receiver code and real IndexedDB.

The listing JSON is a preparation fragment, not an upload manifest. It deliberately
has no invented verified publisher, demo URL, commerce attestation or public MCP
configuration. Its website anchor and plugin-specific policy coverage are not live.

A separate `autolister-public-candidate-NOT-READY.zip` is now prepared in the
parent workspace's `reports/ai-visibility-2026-10-28/comparison-v2/public-preparation`
folder. It preserves the existing package name/version, declares the exact Sites
MCP endpoint without authentication overrides, and includes the listing and icon.
Archive integrity, file inventory and absence of forbidden App bindings passed.
It was uploaded on 2026-11-01 as an unpublished, unsubmitted portal draft. The
portal created a separate submission App; it did not reuse the original private
Sites App. The original private plugin is untouched. Portal connection, live
policy coverage, reviewer access, host tests, demo and declarations remain.

Portal draft: `plugin_asdk_app_6ae70020f5508191a44f9b7ee36ba3c5`, version
`appsub_6ae70020f5748191b5d8584bdd1ce9c8`. All supported countries, five positive
cases and three negative cases imported correctly. The connection dialog selects
OAuth and requires domain verification. Its exact ownership-proof response is
deployed privately and covered by regression checks that keep app and handoff
requests authenticated. The Sites edge still requires sign-in for the challenge
URL, blocking verification. Portal OAuth remains unavailable. Metadata findings about category and privacy
assessment are non-blocking; the demo URL and connection setup remain incomplete.

The [Sites route investigation](sites-public-route.md) records the inspected
account controls and the unresolved canonical App ownership question. The
[review run sheet](review-run-sheet.md) separates actual host cases from local
fixture evidence. A fresh local preflight passed 25 listing, icon and tool-contract
checks; it does not mark the package submission-ready. Its report is
`reports/ai-visibility-2026-10-28/comparison-v2/public-preparation/submission-preflight-2026-10-31.json`
in the parent workspace.

## Before an upload can be called ready

1. Verify the publisher identity through Individual verification. The owner
   explicitly selected this route on 2026-10-31. Do not restart Business
   verification based on AutoLister, Sami Studio, Sami Software Solutions or
   other trading names. Use the legal identity OpenAI verifies; AutoLister stays
   the product name. Completed on 2026-11-01; do not initiate another attempt.
2. Confirm the supported public-submission path for the existing canonical
   Sites App. Do not duplicate it, mark its identity-dependent tools as no-auth,
   change Site access, or expose its raw worker. If a new host is necessary,
   design and test trusted OAuth/gateway identity before migration.
3. Review and deploy the local receiver and policy additions only after owner
   approval. Recheck these exact URLs and their content after deployment.
4. Confirm the commerce declaration: this plugin exposes no purchase tool;
   AutoLister itself offers optional paid generation plans outside ChatGPT.
   Do not infer a legal attestation from that technical observation.
5. Configure dedicated reviewer access through secure portal fields, never this
   package. Verify sign-in and access without the owner's private account.
6. Run the eight review cases in the actual ChatGPT host and record the demo
   below against the submission candidate. Host and verify its accessible URL.
7. Build and inspect a valid portable ZIP after the canonical public endpoint is
   available. Complete portal connection, domain checks, scans and owner legal
   attestations. Submission and publication require separate authorization.

## Demo walkthrough

Use a dedicated reviewer account, a plain item and the seller's own sample photos.
Keep tokens, unrelated chats and private notes off screen.

1. In ChatGPT, attach one item's photos and ask: "Prepare a Vinted draft from
   these photos." Show the real tool result and returned link.
2. Open the transfer page, then Open in AutoLister. Sign in if required. Show the
   imported photos, editable title and description and the saved example note.
3. Edit the title, reopen the same link within 15 minutes and show that the edit
   was retained. Do not publish a marketplace listing.
4. Ask to publish directly to Vinted. Show the explanation that the plugin
   prepares drafts and the seller publishes.
5. Verify the recording is readable on mobile, plays through and exposes no
   secrets. Store its actual accessible URL in review.demo_recording_url.

This is a recording plan. No real ChatGPT demo or public review cases have been
claimed complete in this preparation. No accounts or fixtures have been invited
or publicly hosted.

## Cost and privacy boundaries

SQL caps persist across worker restarts, separate sellers and serialize shared
budget updates. Tests cover replayed settlement and at-cap refusals. These are
resource caps, not a hard dollar ceiling: rejected unauthenticated traffic,
worker invocations and cold-start database denials can still consume resources.
Do not expand access until the public ingress/auth/rate-limiting path is verified.

The proprietary AutoLister model prompt and API keys remain server-side. Plugin
tool instructions and schemas are visible to clients and must not contain secrets.
The Sites private access boundary must be preserved until a supported public
authentication path replaces it.

## Final local verification

Production gate passed on the candidate: lint, type check, build, formatting,
1,215 tests passed and 14 opt-in tests skipped. Independent receiver and storage
tests passed 22/22. The fresh reviewer found no additional actionable packet
issues. Shared-cap, wrong-user, forged-origin, settlement replay and cold-worker
tests passed in isolation. PGlite serializes database calls; this run does not
prove real multi-session PostgreSQL races.

The final transfer-page polish keeps the relay JavaScript unchanged: larger
uncropped photos, a responsive photo grid, one full-width action, visible focus
styles and an accessible fallback picker. Build and artifact validation pass.
The existing independent reviewer confirmed no actionable source issues and no
authentication, account-isolation or cap changes. Local rendered checks cover
desktop, 390px mobile, four photos, cap fallback and expiry. These are fixture
states, not a completed live ChatGPT walkthrough.

The actual local receiver and IndexedDB completed desktop and 390px mobile
imports, applied the enabled example note once and made zero generation calls.
The real error handler rendered account-change rejection at both widths using
a controlled session test double. All support/privacy/terms previews rendered
without horizontal document overflow. These are local fixtures, not a completed
ChatGPT public-host walkthrough. Final test log and independent evidence live in
`reports/ai-visibility-2026-10-28/comparison-v2` in the parent workspace.

## Authoritative references checked

- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth
- https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites
- https://developers.openai.com/plugins/deploy/app-review

Public submission accepts verified individual and organization developers.
ChatGPT Business is not a blanket requirement for public submission. Personal
Sites plugin sharing and public submission are different access paths.
