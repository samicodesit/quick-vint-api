# Private migration to autolister.app

Owner authorized implementation and necessary deployment on 2026-11-01, with no
review submission. Use the existing Vercel site and Supabase project. No new paid
service is authorized or needed for the proposed implementation.

## Authentication design

Reuse Supabase's OAuth server and existing seller sign-in. Do not implement a
password database or a custom OAuth authorization-code/refresh-token server.
Supabase OAuth is currently disabled. Before enabling it:

- Issue OAuth tokens with a dedicated `autolister_plugin` database role that has
  no table, storage or RPC privileges. Ordinary authenticated seller sessions must
  retain their existing role and behavior.
- Reject OAuth tokens at all ordinary backend user-authentication boundaries.
  OIDC scopes alone do not restrict Supabase database or application API access.
- Verify signatures through Supabase, then require the exact issuer, configured
  OAuth client, expiry, plugin role and explicit private tester allowlist.
- Keep registration restricted to the configured OpenAI client. No unrestricted
  dynamic client registration for the private trial.
- Validate resource/audience binding against the actual provider-issued token
  before deployment. Do not claim protocol compatibility from metadata alone.

## Hosting

Serve the ownership challenge as a static plain-text file. Host protected MCP at
`/api/chatgpt/mcp` and use the same-origin AutoLister session for opening drafts.
Strip untrusted identity headers; never carry Sites' trusted-header assumption
onto a publicly reachable Vercel route. Preserve existing SQL-backed transfer
caps, expiry and scheduled cleanup. Keep the private Sites prototype intact until
the replacement passes the complete flow.

## Release gates

Test ordinary account access, OAuth token denial outside the plugin, isolation,
expiry, invalid client/issuer/audience, private allowlist, resource binding,
transfer caps and refresh/revocation. Run the production gate and verify the actual
Vercel release. Complete portal domain verification and OAuth, then exercise the
saved candidate in ChatGPT. Record that actual flow; screenshots are not a demo
recording. Show desktop/mobile visual results before submission, which remains
unauthorized.

## Verified preparation, 2026-11-01

Commit c20ca3a reached main through the production gate: 1,242 tests passed,
14 skipped. The own-host endpoints are deployed but disabled. No OAuth hook,
OAuth client or OAuth server has been activated, and the two new SQL migrations
have not been applied. The original private Sites plugin is unchanged.

The portal does not permit changing an existing app's MCP URL. Its rejected
reupload left the original draft intact. A separate, unsubmitted own-host draft
uses package `autolister`, plugin
`plugin_asdk_app_6ae709b14c7c81919f817a68852863b6`, version
`appsub_6ae709b14ca88191b00dd2000b91dbaf`. The challenge file now targets this
draft. Domain verification is still pending, not proven by file deployment alone.

The owner migrated the legacy signing secret into Supabase's signing-key system.
ECC key 7132d997-8c35-4744-a005-ee8f1fe90520 is visible in the public JWKS.
HS256 remains current pending owner rotation. No key was revoked or deleted.
Ordinary backend validation uses Supabase getUser, and extension validation uses
Supabase getUser and refreshSession. No manual HS256 verifier was found in those
paths. The Supabase dashboard shows no deployed Edge Functions.

Live pre-rotation checks used only the existing dedicated style-test account,
with the exact bundled extension Supabase SDK: fresh magic-link verification,
refresh, Auth getUser, authenticated production /api/user/usage, and own-profile
RLS reads succeeded. The original access token remained accepted after refresh.
No emails, AI generations, customer mutations or sign-outs were performed. The
existing Chrome AutoLister session also opened its drafts and plan/usage UI.
This is pre-rotation evidence, not a claim that ECC issuance has been tested.
After owner rotation, repeat with both the retained HS256 token and newly issued
ECC tokens before enabling any plugin authentication configuration.

Local PGlite execution of the hosted-transfer SQL passed service-role denial,
account isolation, settlement ownership and replay, global byte/prepare/read
caps and expiry. Production catalog inspection confirmed the existing shared
budget table and scheduled cleanup are present. Actual hosted RPC/provider flow,
OAuth refresh/revocation and the recorded ChatGPT demo remain unfinished.
