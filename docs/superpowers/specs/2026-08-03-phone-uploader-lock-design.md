# Phone Uploader Lock Design

## Goal

Prevent two phone tabs or devices using the same v2 QR code from writing competing batches, while keeping different QR sessions independent and preserving v1 behavior.

## Design

The v2 phone page creates one UUID uploader ID per browser tab and keeps it in `sessionStorage`, so reloads in the same tab retain ownership. Its existing prepare request includes that ID.

The API acquires `${sessionId}/_uploader.json` with storage `upsert: false`. The first uploader wins. A retry from the same uploader is accepted after reading the existing lock; a different uploader receives HTTP 409. The lock is a session marker, is excluded from photo counts, and is removed by existing session cleanup. Upload requests remain unchanged, so the lock adds one storage write per batch and no per-photo work. Legacy requests without an uploader ID continue to work during rollout.

On the desktop batch modal, the QR is removed as soon as polling reports an expected phone-photo count. The panel then shows only receiving progress. Different session IDs continue to use different storage prefixes and locks.

## Error Handling

- Invalid uploader IDs return 400.
- A lock owned by another uploader returns 409 with a clear error.
- A lock write error with no readable existing lock remains a server error.
- Completed, cancelled, and expired session behavior remains unchanged.

## Verification

- API tests cover first acquisition, same-uploader retry, different-uploader rejection, and marker exclusion from photo counts.
- Phone-page tests cover the prepare request uploader ID.
- Extension E2E tests confirm the QR disappears when a batch becomes locked to phone upload.
- Existing v1/v2 suites and both production gates must pass.
