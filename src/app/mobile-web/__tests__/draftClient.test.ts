import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  session: vi.fn(),
  upload: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("../api", () => ({ fetchMobileJson: mocks.api }));
vi.mock("../auth", () => ({ getBrowserSession: mocks.session }));
vi.mock("../uploadClient", () => ({
  createMobileUploadSession: () => ({
    sessionId: "upload",
    uploaderId: "sender",
  }),
  uploadPreparedPhotos: mocks.upload,
  cleanupUploadSession: mocks.cleanup,
}));
import { createDraftClient } from "../draftClient";
import { LocalDraftStore } from "../localDraftStore";
import { DEFAULT_DRAFT_SETTINGS } from "../draftContracts";
const id = () => crypto.randomUUID();
let client: ReturnType<typeof createDraftClient>;
beforeEach(async () => {
  const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: "owner" },
    access_token: "token",
  });
  mocks.upload.mockResolvedValue(["signed-photo"]);
  mocks.cleanup.mockResolvedValue(undefined);
  mocks.api.mockResolvedValue({ title: "Dress", description: "Details" });
  client = createDraftClient("owner");
});
async function item() {
  const draft = await client.draftAction("create", {
    id: id(),
    settings: {
      ...DEFAULT_DRAFT_SETTINGS,
      tone: "friendly",
      useHashtags: true,
      includeSellerNote: true,
      descriptionFooterText: "Ships tomorrow",
    },
  });
  await client.uploadDraftPhoto(
    new File(["jpeg"], "photo.jpg", { type: "image/jpeg" }),
    { photoId: id(), importId: id(), draftId: draft.id },
  );
  return client.draftAction("detail", { draftId: draft.id });
}
it("generates through existing uploads, saves locally, and sends all settings without a cloud draft ID", async () => {
  const draft = await item();
  const attempt = { operationId: id(), inputVersion: draft.input_version };
  await client.executeDraftAttempt(draft, attempt, true);
  const [path, init, options] = mocks.api.mock.calls[0];
  expect(path).toBe("/api/generate");
  expect(init.headers["X-Autolister-Request-Id"]).toBe(attempt.operationId);
  expect(JSON.parse(init.body)).toMatchObject({
    imageUrls: ["signed-photo"],
    generationMode: "batch",
    tone: "friendly",
    useHashtags: true,
    descriptionFooterText: "Ships tomorrow",
  });
  expect(JSON.parse(init.body)).not.toHaveProperty("draftId");
  expect(options.expectedUserId).toBe("owner");
  expect(
    (await client.draftAction("detail", { draftId: draft.id })).description,
  ).toBe("Details");
  await client.executeDraftAttempt(draft, attempt, true);
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it("recovers a lost response after reload using a read-only request, without calling generation again", async () => {
  const draft = await item();
  const attempt = { operationId: id(), inputVersion: draft.input_version };
  mocks.api.mockRejectedValueOnce({ code: "network_error", status: 0 });
  await expect(
    client.executeDraftAttempt(draft, attempt, false),
  ).rejects.toMatchObject({ code: "network_error" });
  client.dispose();
  client = createDraftClient("owner");
  mocks.api.mockResolvedValueOnce({
    state: "succeeded",
    result: { title: "Recovered", description: "Saved result" },
  });
  const current = await client.draftAction("detail", { draftId: draft.id });
  await client.executeDraftAttempt(current, attempt, false, {
    tone: false,
    extras: false,
  });
  expect(mocks.api.mock.calls[1][0]).toBe(
    `/api/generation-result?requestId=${attempt.operationId}`,
  );
  expect(mocks.api.mock.calls[1][1].method).toBe("GET");
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(
    (await client.draftAction("detail", { draftId: draft.id })).title,
  ).toBe("Recovered");
});
it("blocks pending and different operations and rejects changed input", async () => {
  const draft = await item();
  await expect(
    client.executeDraftAttempt(
      draft,
      { operationId: id(), inputVersion: 0 },
      false,
    ),
  ).rejects.toMatchObject({ code: "draft_conflict" });
  const attempt = { operationId: id(), inputVersion: draft.input_version };
  mocks.api.mockRejectedValueOnce({ code: "network_error" });
  await expect(
    client.executeDraftAttempt(draft, attempt, false),
  ).rejects.toBeDefined();
  await expect(
    client.executeDraftAttempt(draft, { ...attempt, operationId: id() }, false),
  ).rejects.toMatchObject({ code: "draft_conflict" });
  mocks.api.mockResolvedValueOnce({ state: "pending" });
  await expect(
    client.executeDraftAttempt(draft, attempt, false),
  ).rejects.toMatchObject({ code: "generation_commit_pending" });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
});
it("never regenerates an expired or missing old operation automatically", async () => {
  const draft = await item();
  const attempt = { operationId: id(), inputVersion: draft.input_version };
  const store = new LocalDraftStore("owner");
  const saved = await store.beginAttempt(draft.id, attempt, false);
  await store.updateAttempt({ ...saved, sentAt: Date.now() - 86400000 });
  mocks.api.mockResolvedValueOnce({ state: "missing" });
  await expect(
    client.executeDraftAttempt(draft, attempt, false),
  ).rejects.toMatchObject({ code: "generation_retry" });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.api.mock.calls[0][1].method).toBe("GET");
});
it("does not send another account's photos after the account changes", async () => {
  const draft = await item();
  mocks.session.mockResolvedValue({
    user: { id: "different-owner" },
    access_token: "other-token",
  });
  await expect(
    client.executeDraftAttempt(
      draft,
      { operationId: id(), inputVersion: draft.input_version },
      false,
    ),
  ).rejects.toMatchObject({ code: "account_changed" });
  expect(mocks.api).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("retains a successful result through a failed local save without sending generation again", async () => {
  const draft = await item();
  const fault = vi
    .spyOn(LocalDraftStore.prototype, "finishAttempt")
    .mockRejectedValueOnce(
      Object.assign(new Error("Storage full"), { code: "storage_limit" }),
    );
  await expect(
    client.executeDraftAttempt(
      draft,
      { operationId: id(), inputVersion: draft.input_version },
      false,
    ),
  ).rejects.toMatchObject({ code: "storage_limit" });
  fault.mockRestore();
  const recovered = await client.draftAction("recover", { draftId: draft.id });
  expect(recovered.operation_state).toBe("succeeded");
  expect(recovered.title).toBe("Dress");
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
