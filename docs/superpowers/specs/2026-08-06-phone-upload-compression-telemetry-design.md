# Phone upload compression telemetry

## Goal

Make successful and failed phone uploads explainable without logging filenames or photo contents, and without allowing telemetry to affect upload behavior.

## Design

Reuse the existing `phone_upload_send_summary` event. Add one compact `compression` object containing:

- original MIME-type counts;
- original, pre-upload, and compressed byte summaries (`count`, `min`, `max`, `total`);
- zero-byte counts at selection and immediately before compression;
- counts for normal compression, DNG preview conversion, unchanged fallback, and failed preparation;
- browser context already used by failure events (`userAgent`, `platform`, `deviceMemory`, and viewport).

Each file item stores only numeric/type telemetry needed for the final aggregate. Do not log filenames. Upload errors also retain the server's response message when available.

## Safety

All reads are optional and normalized to `null`, zero, or an empty object. Summary construction remains synchronous and wrapped by the existing fail-open `trackUploadEvent`; no browser API is required and no telemetry operation may block compression or upload.

## Check

Extend the existing phone-upload HTML contract test to require the summary fields and the fail-open browser metadata access. No new dependencies.
