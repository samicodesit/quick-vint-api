# Agent Instructions

This repo is mostly operated by AI agents. Treat `main` as the production backend/site/admin branch.

## Email

Send every AutoLister email through Resend. This includes customer support,
replies, follow-ups, alerts, and internal test emails. This rule applies even
when the user says only "send an email" without naming Resend.

Every customer-facing email must use the existing branded HTML email template.
Never send a customer-facing plain-text-only email. Use the support template
for support messages and the appropriate existing HTML template for other
customer email types.

Gmail is read-only for AutoLister work. It may be used to search/read messages
or debug delivery and threads only. Never use Gmail to draft, send, reply, or
forward, including Gmail `_send_email`, `_send_draft`, `_create_draft`,
`_update_draft`, or forwarding tools.

For customer support and replies, use the support/Resend flow below.

Match the outbound AutoLister sender to the original AutoLister address the
customer emailed. For example, if the customer wrote to `hello@autolister.app`,
send from `AutoLister AI <hello@autolister.app>`. If they wrote to
`support@autolister.app`, send from `AutoLister AI <support@autolister.app>`.

The supported outbound path is:

```bash
npm run ops:support-reply -- --to user@example.com --subject "Re: ..." --text "..." --message-id "<original-rfc-message-id>" --from "AutoLister AI <original-inbound@autolister.app>"
```

Required flow:

1. Read `scripts/send-support-reply.mjs` before sending and confirm it still
   uses the support HTML template and defaults `reply_to` to the email address
   in `--from`.
2. Read the original email raw MIME and extract its RFC `Message-ID`, not the
   Gmail message id.
3. Run the support command with `--dry-run` first and inspect the generated
   payload.
4. Send only after the dry-run payload is correct and `RESEND_API_KEY` is
   available.
5. If `RESEND_API_KEY` is missing, stop and report the blocker. Never fall back
   to Gmail or another outbound provider.
6. Verify a support-template send only from the support script output/Resend
   response. A Gmail sent item is not proof of a support-template send.
7. If a reply was already sent through the wrong channel, do not send a second
   support-template reply unless the user explicitly approves the duplicate.

## Deployment

Vercel deploys from `main` automatically.

- After committing changes that should go live, run `npm run push:production`.
- Do not call backend/admin/API work "pushed" unless `origin/main` moved.
- Use `npm run push:production` for backend/admin/API pushes. It refuses non-`main`, runs the production gate, then pushes only if the gate passes.
- Valid completion proof for a live backend push must include:

```txt
Repo: quick-vint-api
Branch pushed: main
Push output includes: main -> main
```

- Pushing a feature branch is only branch backup. It does not count as pushed or deployed.
- Do not run `vercel deploy --prod` after a normal push to `main`.
- Only deploy manually if the operator explicitly asks for it, or if auto-deploy is confirmed broken and the operator approves the manual deploy.

## Checks

The production push command runs the full local gate:

```bash
npm run push:production
```

For checking without pushing, run `npm run verify:production`.

Do not call a backend/API fix complete from helper-level tests only. Endpoint incidents need endpoint-level tests under `src/api/__tests__/` or a documented reason why the behavior cannot be tested there.

For admin UI changes, also run:

```bash
npm test -- src/pages/__tests__/adminHtml.test.ts
```

## Production Log Investigations

Before querying production/admin/Vercel logs, read and follow:

- `docs/production-log-runbook.md`

Hard wall: production admin/API/Vercel log queries must be run with network escalation on the first attempt in Codex. Do not try sandboxed `curl`, `vercel logs`, or production helper scripts first. Use `log-detail` for request bodies and Vercel logs for endpoint-hit proof when admin logs omit successful rows.
