import { describe, expect, it, vi } from "vitest";

import {
  canReuseMobileGenerationUpload,
  getMobileUsageDisplay,
  revokeMobileUploadedPreviews,
} from "../app.js";

describe("mobile web app state helpers", () => {
  it("shows free lifetime plus pack capacity instead of hiding pack credits", () => {
    expect(
      getMobileUsageDisplay({
        plan: { tier: "free" },
        remaining: {
          freeLifetime: 0,
          daily: null,
          monthly: null,
          minute: null,
          packCredits: 5,
        },
        canGenerate: true,
      }),
    ).toBe("5 generations left");
  });

  it("uses the effective paid capacity and the minute cap", () => {
    expect(
      getMobileUsageDisplay({
        plan: { tier: "pro" },
        remaining: {
          freeLifetime: null,
          daily: 2,
          monthly: 20,
          minute: 1,
          packCredits: 4,
        },
        canGenerate: true,
      }),
    ).toBe("1 generation left");
  });

  it("does not reuse signed URLs when the selected photo order changed", () => {
    expect(
      canReuseMobileGenerationUpload(
        ["photo-a", "photo-b"],
        ["photo-a", "photo-b"],
        2,
      ),
    ).toBe(true);
    expect(
      canReuseMobileGenerationUpload(
        ["photo-a", "photo-b"],
        ["photo-b", "photo-a"],
        2,
      ),
    ).toBe(false);
    expect(canReuseMobileGenerationUpload(["photo-a"], ["photo-a"], 0)).toBe(
      false,
    );
  });

  it("releases prepared preview URLs when upload artifacts are discarded", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    revokeMobileUploadedPreviews([
      { order: 0, name: "photo-0.jpg", url: "signed-0", previewUrl: "blob:0" },
      { order: 1, name: "photo-1.jpg", url: "signed-1" },
    ]);

    expect(revoke).toHaveBeenCalledWith("blob:0");
    revoke.mockRestore();
  });
});
