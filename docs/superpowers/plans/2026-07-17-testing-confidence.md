# AutoLister Test Confidence Plan

Date: 2026-07-17

This plan covers both repos:

- frontend extension: `../quick-vint`
- backend/API/site: `../quick-vint-api`

## Goal

Make production-impacting workflows hard to break silently. Tests should prove the real request/response contract across the extension and backend, not only isolated helpers.

## Current Baseline

Frontend:

- Unit tests: `npm run test:unit`
- E2E tests: `npm run test:e2e`
- Full gate: `npm test` then `npm run build:prod`
- CI must run unit tests, Playwright E2E, and production build.

Backend:

- Full gate: `pnpm run lint`, `pnpm run type-check`, `pnpm run build`, `pnpm run format-check`, `pnpm test`
- CI already runs those checks plus production dependency audit.

## High-Risk Flows

Generation and uploads:

- Manual Vinted file upload must use temp storage URLs when original files are captured.
- Phone upload single mode must use temp storage URLs.
- Batch mode must use temp storage URLs.
- Visible Vinted remote images are fallback behavior only when captured originals cannot be trusted.
- Backend `/api/generate` must convert allowed remote image URLs to data URLs before OpenAI.
- Backend `/api/generate` must refund generation reservations and return simple user-facing errors when OpenAI/image processing fails.

Auth and entitlement:

- Extension must use stored Supabase session, not only in-memory popup state.
- Backend must validate JWTs and enforce tier features server-side.
- Rate-limit reservation must happen only after request validation and must commit only after generation success.

Payments:

- Checkout must not create duplicate subscriptions for active paid users.
- Stripe must remain the source of truth when Supabase profile state is stale.
- Webhooks must reset usage only on the intended subscription transitions.

Ops/logging:

- Production incidents must be investigated with `docs/production-log-runbook.md`.
- Endpoint incidents need endpoint-level tests under `src/api/__tests__/`, not only helper tests.

## Required Pattern For Future Fixes

1. Reproduce or identify the failing contract from logs/tests.
2. Add or update the smallest endpoint/E2E regression test that would have caught it.
3. Implement the fix.
4. Run the repo's full gate before claiming completion.
5. For cross-repo contracts, verify both sides:
   - extension payload shape and metadata
   - backend request handling and user-facing response

## Known Gaps To Keep Closing

- Add more backend endpoint tests for `/api/generate` auth, malformed payload, rate-limit denial, and profile recovery paths when those areas are touched.
- Add frontend E2E when Vinted changes DOM selectors or file-input behavior; do not rely on regex-only selector tests for upload-critical behavior.
- Keep agent docs in both repos aligned with actual scripts so future agents do not skip unit or E2E suites.
