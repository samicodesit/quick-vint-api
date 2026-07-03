# Sentry Setup

AutoLister uses Sentry only for high-value production failures by default.
The integration is intentionally conservative so free-tier quota is not spent on
routine logs, traces, profiling, or expected 4xx responses.

## Vercel Environment Variables

Set these on the production project:

- `SENTRY_DSN`: the Node.js project DSN from Sentry.
- `SENTRY_ENVIRONMENT`: optional. Use `production` if unset `VERCEL_ENV` is not clear enough.
- `SENTRY_TRACES_SAMPLE_RATE`: optional. Leave unset or `0` unless actively debugging performance.

Do not hardcode the DSN in source files.

## What Gets Sent

Only calls to `reportCriticalEndpointFailure` send Sentry events. These are
already limited to important 5xx failures on generation, auth, checkout, webhook,
offer-claim, and phone-upload flows.

Each event includes:

- `critical_endpoint=true`
- endpoint and status tags
- user id when already known
- bounded diagnostic context, with long strings truncated

Request bodies, cookies, and auth headers are not sent.

## What Is Off

- Sentry logs
- tracing by default
- profiling
- automatic client/session replay capture

Enable those later only with an explicit sampling plan.
