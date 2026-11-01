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

Status: implementation in progress. No OAuth configuration or production API
change has been made by this migration yet.
