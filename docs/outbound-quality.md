# Outbound quality requirements

These are standing user requirements for AutoLister support, outreach and ads.

## Email

- Use Resend and the existing branded HTML template for every customer-facing email. Gmail is read-only.
- Every actionable URL must be an explicit anchor with a readable label. Do not rely on email-client automatic linking or display raw tracking parameters.
- With `ops:support-reply`, use `[View the demo](https://...)` in `--text`. Bare HTTP(S) URLs are also rendered as anchors with query strings hidden from their labels.
- Before each send, dry-run the exact message and inspect its final HTML at wide and narrow widths. Check spacing, wrapping, branding, link styling, all anchor destinations and the promised offer. A successful API response is not visual QA.
- Keep support replies in the original thread, use the original inbound AutoLister address as sender, and follow the repository's support-reply instructions.
- Send once and verify Resend delivery state. Never send a duplicate formatting correction without explicit user approval.
- Sender regression check: `node --test scripts/send-support-reply.test.mjs`.

## Copy, media and destination

- Reject generic filler, awkward translations, invented proof, exaggerated claims, fake product UI, irrelevant imagery and unreadable screenshots.
- Reuse assets only when they accurately explain the current product and fit the audience and placement. Create new assets when reuse fails that check.
- Inspect the actual final placement preview, including crop, readability, sound or captions, disclosure and CTA. Verify recipient/account, audience, schedule, total cost including fees and currency allowance, and automatic creative changes.
- Check the exact final destination and the critical path to the promised value. Record untested steps explicitly. Do not claim a whole journey was verified from a screenshot or an HTTP response.
- Keep website copy free of new Vinted branding or mentions. External seller marketing may accurately describe the independent tool's intended audience, without implying affiliation.
- Use browser-neutral wording and represent supported workflows accurately. Sellers review details and publish themselves; do not invent guarantees of speed, sales or authenticity.

## Recipient context and measurement

- Consult current workspace instructions for customer exclusions before selecting recipients. Customer identifiers and private account details belong in local operational records, not this reusable guide.
- Check prior contact, opt-outs, platform rules and recipient local time. Prefer appropriate business hours for new business outreach; late-night silence is not a reason to send follow-ups.
- Record real QA evidence and unresolved limitations in the current sprint record. Material failures block the affected send, publication or spending decision.
- Report signups, successful use, repeat use and payment separately. Follower counts and clicks are not qualified customers. Do not scale spending without evidence of useful activation.
