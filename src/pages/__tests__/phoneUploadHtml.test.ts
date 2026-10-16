import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  join(process.cwd(), "src/pages/phone-upload.html"),
  "utf8",
);

describe("phone upload page v2 contract", () => {
  it("terminates the exact failed transfer before retrying a network error", () => {
    const handler = html.match(
      /xhr\.onerror = \(\) => \{([\s\S]*?)\n                    \};/,
    )?.[1];
    expect(handler).toBeTruthy();
    const events: Array<{ event: string; context: Record<string, unknown> }> =
      [];
    const xhr = {};
    const state = { activeRequests: new Set([xhr]) };
    const item = { failed: false, uploading: true };
    let rejected: Error | undefined;
    new Function(
      "state",
      "xhr",
      "ui",
      "item",
      "renderBatchProgress",
      "reject",
      "trackUploadEvent",
      "telemetryAttemptId",
      "idleTimer",
      "attempt",
      handler!,
    )(
      state,
      xhr,
      null,
      item,
      () => {},
      (error: Error) => {
        rejected = error;
      },
      (event: string, context: Record<string, unknown>) =>
        events.push({ event, context }),
      "transfer-attempt-1",
      undefined,
      0,
    );
    expect(events).toEqual([
      {
        event: "phone_upload_transfer_error",
        context: {
          operationId: "transfer-attempt-1",
          errorCode: "UPLOAD_NETWORK_ERROR",
          statusCode: 0,
          message: "Upload error",
        },
      },
    ]);
    expect(rejected?.message).toBe("Upload error");
    expect(item).toEqual({ failed: true, uploading: false });
    expect(state.activeRequests.size).toBe(0);
  });
  it("keeps the primary action fixed and respects reduced motion", () => {
    expect(html).toContain('class="phone-upload-action-bar"');
    expect(html).toMatch(
      /body\.v2-mode \.phone-upload-action-bar\s*\{[\s\S]*?position:\s*fixed/,
    );
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("upload-cta-glow");
    expect(html).toContain(
      '<p class="session-expiry-hint">Expires after 1 hour idle.</p>',
    );
  });

  it("starts v2 transfers on selection and keeps append available", () => {
    expect(html).toContain("Add more photos");
    expect(html).toContain("const reorderActions = isV2() ? '' : `");
    expect(html).toContain("${reorderActions}");
    expect(html).toMatch(
      /body\.v2-mode \.session-footer\s*\{\s*display:\s*none;/,
    );
    expect(html).toContain("await prepareExpectedCount()");
    expect(html).toContain("setTimeout(sendBatchFiles, 0)");
    expect(html).toContain('class="upload-state"');
    expect(html).toContain("uploadState.textContent = '✓'");
    expect(html).toContain("uploadState.classList.add('upload-complete')");
    expect(html).toContain(
      "uploadState.setAttribute('aria-label', 'Photo ready')",
    );
    expect(html).toContain("sendBtn.style.display = 'none'");
  });

  it("uses clear v2 primary-action states", () => {
    expect(html).toContain("Adding ${active} of ${total}…");
    expect(html).toContain("Retry ${failed} failed photo");
    expect(html).toContain("${total} photos ready on your computer");
    expect(html).toContain("mainBtn.classList.toggle('is-uploading'");
    expect(html).toContain("mainBtn.classList.toggle('is-error'");
    expect(html).toContain("mainBtn.classList.toggle('is-ready'");
    expect(html).toContain("Cancel Entire Upload");
  });

  it("turns a locked v2 session into a terminal page", () => {
    expect(html).toContain("action=status&v=2");
    expect(html).toContain("const STATUS_POLL_MS = 3000");
    expect(html).toContain("Photos added on your computer");
    expect(html).toContain("You can close this page.");
    expect(html).toContain("renderTerminalSuccess()");
  });

  it("reports the number of upload attempts actually made", () => {
    expect(html).toContain("let attempts = 0");
    expect(html).toContain("attempts += 1");
    expect(html).toContain("attempts,");
    expect(html).not.toContain("attempts: UPLOAD_RETRY_DELAYS_MS.length + 1");
  });

  it("adds fail-open compression evidence to upload summaries", () => {
    expect(html).toContain("function getCompressionSummary(items)");
    expect(html).toContain("originalTypes");
    expect(html).toContain("originalBytesAtSelection");
    expect(html).toContain("originalBytesBeforeCompression");
    expect(html).toContain("uploadedBytes");
    expect(html).toContain("serverReceivedBytes");
    expect(html).toContain("zeroBytesAtSelection");
    expect(html).toContain("zeroBytesBeforeCompression");
    expect(html).toContain("compressionRoutes");
    expect(html).toContain("userAgent: navigator?.userAgent || null");
    expect(html).toContain("compression: getCompressionSummary(state.files)");
  });

  it("shows batch progress on the disabled send action instead of every photo", () => {
    expect(html).toMatch(
      /\.batch-mode \.file-info \.progress-bar,[\s\S]*?\.batch-mode \.file-status[\s\S]*?display:\s*none/,
    );
    expect(html).toContain(
      "mainBtn.lastChild.textContent = `Adding ${active} of ${total}…`",
    );
    expect(html).toContain(
      "mainBtn.disabled = state.isSending || state.completeSent",
    );
  });

  it("keeps one uploader identity per v2 browser tab", () => {
    expect(html).toContain("sessionStorage.getItem(key)");
    expect(html).toContain("sessionStorage.setItem(key, uploaderId)");
    expect(html).toContain("state.uploaderId = getUploaderId(state.sessionId)");
    expect(html).toContain(
      "&uploaderId=${encodeURIComponent(state.uploaderId)}",
    );
  });
});
