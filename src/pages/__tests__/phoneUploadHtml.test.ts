import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  join(process.cwd(), "src/pages/phone-upload.html"),
  "utf8",
);

describe("phone upload page v2 contract", () => {
  it("keeps the send action fixed and respects reduced motion", () => {
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

  it("keeps the v2 review to add, remove, and one explicit send", () => {
    expect(html).toContain("Add more photos");
    expect(html).toContain("remove-photo");
    expect(html).toContain("const reorderActions = isV2() ? '' : `");
    expect(html).toContain("${reorderActions}");
    expect(html).toMatch(
      /body\.v2-mode \.session-footer\s*\{\s*display:\s*none;/,
    );
    expect(html).toContain("Send ${state.files.length} photo");
    expect(html).toContain("if (isV2())");
    expect(html).toContain("await prepareExpectedCount()");
  });

  it("locks draft controls once a v2 upload starts", () => {
    expect(html).toContain("setDraftControlsLocked(true)");
    expect(html).toContain("state.draftLocked = locked");
    expect(html).toContain("state.isSending || state.draftLocked");
    expect(html).toContain("Retry Failed Photos");
    expect(html).toContain("Cancel Entire Upload");
  });

  it("reports the number of upload attempts actually made", () => {
    expect(html).toContain("let attempts = 0");
    expect(html).toContain("attempts += 1");
    expect(html).toContain("attempts,");
    expect(html).not.toContain("attempts: UPLOAD_RETRY_DELAYS_MS.length + 1");
  });

  it("shows batch progress on the disabled send action instead of every photo", () => {
    expect(html).toMatch(
      /\.batch-mode \.file-info \.progress-bar,[\s\S]*?\.batch-mode \.file-status[\s\S]*?display:\s*none/,
    );
    expect(html).toContain(
      "sendBtn.textContent = `Sending ${sent} / ${total}`",
    );
    expect(html).toContain(
      "sendBtn.disabled = state.isSending || state.completeSent",
    );
  });
});
