# Web app paid journey audit, 2026-10-12

Read-only production log-detail records, account entitlement, rate counters and committed reservations were checked. No customer account was changed, no purchase was made and no customer generation was triggered.

## Observed journey

- iOS browser, Google search first touch, homepage app CTA clicked at 16:28:56 UTC. The durable queue delivered that click at 16:35:10. Receipt time alone does not describe the journey.
- Five successful free generations between 16:30 and 16:33. AI received 2, 3, 4, 2 and 2 photos respectively. Recorded API time was 4.46 to 6.16 seconds. No complete frontend interaction trace exists for this initial period.
- Starter checkout cancelled at 16:35:32. A second Starter checkout was initiated at 16:36:25. Stripe webhook recorded an active subscription at 16:36:41. Successful web app return at 16:36:45.
- Seven further committed plan generations, starting at 16:36:51, followed by successful title and description copy events. Most paid API calls took 3.71 to 4.98 seconds. A recovery lookup returned the saved result, with no extra reservation. The cause of that lookup is not proven by logs alone.
- Daily paid counter and monthly paid usage were both 7 when checked. Lifetime trial counter stayed at 5. All five free reservations had counted_day=false; the seven paid reservations had counted_day=true. No quota correction was needed.
- Active Starter entitlement is confirmed. This is the first paid web-app customer found in the available launch evidence. A successful return alone is not payment proof; the Stripe webhook is activation evidence.

## Limits and fixes

Records prove activation, successful generations, payment return and useful copying. They do not prove an absence of confusion, explain why checkout was cancelled, show whether the existing run was batch or single, or confirm publishing on a marketplace.

- Reproduced real admin View failure: image_urls contains JSON null, causing map() to throw. Normalize only arrays, retaining support for historical rows.
- Lightweight list projections had no photo count. Select scalar count and payment status/tier fields without full request bodies for each list row. Label missing previews honestly instead of claiming zero images. Show subscription activation as PAID and checkout return outcome explicitly.
- No preview copies are added. Mobile photo URLs remain redacted from persistent logs; payloads and the existing processed-upload pipeline are unchanged.
- Two bounded business events distinguish generation run size/method and paid-option presentation/reason. Per-item success/error and copy use the existing durable queue. No draft text, signed photo URLs or new service/table is added.
- After mobile saved-result and allowance commits, use Vercel waitUntil for reporting. Generation delivery does not await reporting. Extension behavior and all quota/credit commits are unchanged.
- Admin refresh remains manual. Events already batch, deduplicate, retry from durable browser storage and retain occurrence time separately from receipt time. No real-time polling is added.

## Validation

- New regressions failed before fixes for JSON-null modal opening, missing compact counts/outcomes and a slow reporting write holding up a successful endpoint response.
- Real Chromium: desktop 1440 and phone 390, six modal open/close cycles, zero page errors, no production requests. Uses shipped HTML with representative redacted production record shape.
- Endpoint regressions cover committed result before response, slow reporting, idempotency, extension compatibility, failures, refunds and recovery. Events endpoint checks exercise real local PostgreSQL-compatible storage, response-loss dedupe and checkout flow completion.
- Full phone journey and release-gate results are recorded in the sprint after completion. The customer journey cannot be re-enacted safely; observed outcome is separate from fixture QA.
