import { beforeEach, expect, it, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../api", () => ({ fetchMobileJson: api }));
import { executeDraftAttempt } from "../draftClient";
import type { Draft } from "../draftContracts";
const draft = {
  id: "draft",
  operation_id: "accepted-operation",
  operation_state: "succeeded",
  input_version: 3,
  title: "Saved",
  description: "Result",
} as Draft;
beforeEach(() => vi.clearAllMocks());
it("recovers an accepted completed attempt after reload without dispatching another generation", async () => {
  api.mockResolvedValue(draft);
  await executeDraftAttempt(
    draft,
    { operationId: "accepted-operation", inputVersion: 2 },
    true,
  );
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0][0]).toBe("/api/drafts");
  expect(JSON.parse(api.mock.calls[0][1].body).action).toBe("recover");
});
it("retains the same ID for a request that never reached the server", async () => {
  api.mockResolvedValue({ title: "New", description: "New" });
  await executeDraftAttempt(
    { ...draft, operation_id: null, operation_state: "idle", input_version: 2 },
    { operationId: "unaccepted-operation", inputVersion: 2 },
    true,
  );
  expect(api.mock.calls[0][0]).toBe("/api/generate");
  expect(api.mock.calls[0][1].headers["X-Autolister-Request-Id"]).toBe(
    "unaccepted-operation",
  );
});
it("does not mistake another operation's result for this attempt", async () => {
  api.mockResolvedValue(draft);
  await expect(
    executeDraftAttempt(
      { ...draft, operation_state: "running" },
      { operationId: "different-operation", inputVersion: 2 },
      true,
    ),
  ).rejects.toMatchObject({ code: "draft_conflict" });
});
it("blocks an uncertain attempt and refuses changed input instead of silently starting fresh", async () => {
  api.mockResolvedValue({ ...draft, operation_state: "pending" });
  await expect(
    executeDraftAttempt(
      draft,
      { operationId: "accepted-operation", inputVersion: 2 },
      true,
    ),
  ).rejects.toMatchObject({ code: "generation_commit_pending" });
  await expect(
    executeDraftAttempt(
      { ...draft, operation_id: null, operation_state: "idle" },
      { operationId: "unaccepted-operation", inputVersion: 1 },
      true,
    ),
  ).rejects.toMatchObject({ code: "draft_conflict" });
});
