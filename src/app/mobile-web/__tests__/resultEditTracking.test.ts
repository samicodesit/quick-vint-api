import { afterEach, expect, it, vi } from "vitest";
import { getBrowserSession } from "../auth";
import { sendResultEdit, trackResultEdits } from "../resultEditTracking";
afterEach(() => vi.useRealTimers());
it("coalesces typing, reports a full undo, and keeps the last slot for the terminal state", () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const t = trackResultEdits(
    { title: "Coat", description: "Wool" },
    "attempt",
    emit,
  );
  vi.advanceTimersByTime(6 * 60000);
  expect(emit).not.toHaveBeenCalled();
  expect(t.expose()).toBe(true);
  expect(t.expose()).toBe(false);
  for (let i = 0; i < 100; i++) t.edit("title", "Coat " + i);
  expect(emit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(20001);
  expect(emit.mock.calls[0][0]).toMatchObject({
    titleChanged: true,
    finalTitle: "Coat 99",
  });
  t.edit("title", "Coat");
  t.flush("focusout");
  expect(emit.mock.calls[1][0]).toMatchObject({
    titleChanged: false,
    descriptionChanged: false,
  });
  expect(emit.mock.calls[1][0]).not.toHaveProperty("finalTitle");
  t.edit("description", "Wool, small mark.");
  t.flush("hidden");
  t.close("pagehide");
  t.close("dispose");
  expect(emit).toHaveBeenCalledTimes(3);
  expect(emit.mock.calls[2][0]).toMatchObject({
    finalDescription: "Wool, small mark.",
    editSequence: 3,
  });
});
it("discards pending copy on account change, including its timer", () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const t = trackResultEdits(
    { title: "Coat", description: "Wool" },
    "attempt",
    emit,
  );
  t.expose();
  t.edit("description", "private change");
  t.close("account_changed");
  vi.runAllTimers();
  expect(emit).not.toHaveBeenCalled();
});

vi.mock("../auth", () => ({
  getBrowserSession: vi.fn(),
  refreshBrowserSession: vi.fn(),
  signOutBrowser: vi.fn(),
}));
it("uses the current token and refuses an edit after an account switch", async () => {
  const request = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", request);
  try {
    vi.mocked(getBrowserSession).mockResolvedValue({
      access_token: "rotated",
      user: { id: "owner" },
    } as any);
    await sendResultEdit("owner", { titleChanged: true });
    expect(request).toHaveBeenCalledWith(
      "/api/events/track",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer rotated" }),
      }),
    );
    vi.mocked(getBrowserSession).mockResolvedValue({
      access_token: "other",
      user: { id: "another-account" },
    } as any);
    await expect(
      sendResultEdit("owner", { titleChanged: true }),
    ).rejects.toMatchObject({ code: "account_changed" });
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
