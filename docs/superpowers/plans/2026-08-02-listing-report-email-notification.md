# Listing Report Email Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email `samicodesit@gmail.com` once for every accepted `listing_report_submitted` event and no other tracking event.

**Architecture:** Keep the behavior in the existing `/api/events/track` handler, immediately after event persistence. Reuse the installed Resend client, send a plain-text report summary, and treat delivery as best-effort so notification failures never discard reports.

**Tech Stack:** TypeScript, Vercel Functions, Resend, Vitest

## Global Constraints

- Match only the exact event name `listing_report_submitted`.
- Send to `samicodesit@gmail.com` from `AutoLister AI Alerts <alerts@autolister.app>`.
- Include report context, authenticated user email, plan, page, and extension version when available.
- Do not add dependencies, frontend changes, database changes, queues, or retries.
- A Resend failure must be logged and must not change the endpoint's `204` response.

---

### Task 1: Notify on accepted listing reports

**Files:**

- Modify: `src/api/__tests__/eventsTrack.test.ts`
- Modify: `api/events/track.ts`

**Interfaces:**

- Consumes: normalized event items already persisted through `ApiLogger.logRequests`.
- Produces: one Resend `emails.send` call per accepted `listing_report_submitted` item; the endpoint still returns HTTP 204.

- [ ] **Step 1: Write the failing endpoint tests**

Extend `src/api/__tests__/eventsTrack.test.ts` with Resend, Supabase, and logger doubles, then invoke the real endpoint handler with a POST request. Add one test using this report payload:

```ts
{
  event: "listing_report_submitted",
  source: "extension_content",
  page: "https://www.vinted.nl/items/new",
  plan: "pro",
  extensionVersion: "1.3.25",
  context: {
    category: "tool_bug",
    message: "The generated title is empty",
  },
}
```

Assert the endpoint returns 204 and the outbound email has literal recipient
`samicodesit@gmail.com`, the alerts sender, and text containing the category,
message, authenticated email, plan, page, and version. Add a second invocation
with `listing_report_opened` and assert that it sends no email.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/api/__tests__/eventsTrack.test.ts
```

Expected: FAIL because the endpoint never constructs a Resend client or sends a
notification.

- [ ] **Step 3: Add the minimal notification code**

In `api/events/track.ts`, import `Resend`, instantiate it with the existing
`RESEND_API_KEY`, and add a small function that sends this plain-text payload:

```ts
await resend.emails.send({
  from: "AutoLister AI Alerts <alerts@autolister.app>",
  to: "samicodesit@gmail.com",
  subject: `Listing report: ${String(context.category || "other")}`,
  text: JSON.stringify(
    {
      ...context,
      userEmail: userEmail || null,
      plan: item.plan,
      page: item.page,
      extensionVersion: item.extensionVersion,
    },
    null,
    2,
  ),
});
```

After `ApiLogger.logRequests` resolves, filter `loggableEventItems` by the exact
event name and await each send in a `try/catch`. Log caught exceptions and
resolved Resend errors without rethrowing.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/api/__tests__/eventsTrack.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run the production verification gate**

Run:

```bash
npm run verify:production
```

Expected: lint, type-check, build, formatting, and all tests PASS.

- [ ] **Step 6: Commit the implementation**

```bash
git add api/events/track.ts src/api/__tests__/eventsTrack.test.ts
git commit -m "Email listing report submissions"
```

- [ ] **Step 7: Verify scope and push production**

Confirm that commits after `origin/main` contain only the approved design, plan,
endpoint, and endpoint test. Then run:

```bash
npm run push:production
```

Expected: the production gate passes again and push output contains
`main -> main` for `quick-vint-api`.
