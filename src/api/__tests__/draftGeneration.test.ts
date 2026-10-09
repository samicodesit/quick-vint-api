import { beforeEach, expect, it, vi } from "vitest";
const { mutate, owned, photos, load, commit, status } = vi.hoisted(() => ({
  mutate: vi.fn(),
  owned: vi.fn(),
  photos: vi.fn(),
  load: vi.fn(),
  commit: vi.fn(),
  status: vi.fn(),
}));
vi.mock("../../../utils/listingDrafts", () => ({
  mutateDraft: mutate,
  ownedDraft: owned,
  draftPhotos: photos,
  loadDraft: load,
  draftsEnabled: () => true,
  DRAFT_BUCKET: "listing-drafts",
  DraftError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("../../../utils/rateLimiter", () => ({
  RateLimiter: {
    commitGenerationReservationVerified: commit,
    getGenerationReservationStatus: status,
  },
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async () => ({
          data: [{ signedUrl: "https://images.test/photo" }],
          error: null,
        }),
      }),
    },
  },
}));
import {
  prepareDraftGeneration,
  recoverDraftGeneration,
} from "../../../utils/draftGeneration";
const id = "123e4567-e89b-42d3-a456-426614174000";
const op = "123e4567-e89b-42d3-a456-426614174001";
const row = {
  id,
  operation_id: op,
  operation_state: "running",
  input_version: 2,
  settings: {
    titleLanguageCode: "fr",
    descriptionLanguageCode: "fr",
    descriptionLength: "long",
    useBulletPoints: true,
  },
  _claimed: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockResolvedValue(row);
  owned.mockResolvedValue(row);
  photos.mockResolvedValue([
    { id: "photo", digest: "digest", status: "ready", object_key: "private" },
  ]);
  load.mockResolvedValue({
    id,
    title: "Saved",
    description: "Result",
    operation_state: "succeeded",
  });
  commit.mockResolvedValue({ ok: true });
});
it("derives inputs from owned stored photos and settings and fingerprints stable IDs", async () => {
  const result = await prepareDraftGeneration(
    id,
    { draftId: id, inputVersion: 2 },
    op,
  );
  expect(result.body).toMatchObject({
    imageUrls: ["https://images.test/photo"],
    titleLanguageCode: "fr",
  });
  expect(result.context?.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(mutate).toHaveBeenCalledWith(id, "claim", {
    draftId: id,
    inputVersion: 2,
    operationId: op,
  });
});
it("never dispatches the provider a second time for an existing operation", async () => {
  mutate.mockResolvedValue({
    ...row,
    _claimed: false,
    operation_state: "succeeded",
  });
  owned.mockResolvedValue({ ...row, operation_state: "succeeded" });
  const result = await prepareDraftGeneration(
    id,
    { draftId: id, inputVersion: 2 },
    op,
  );
  expect(result.response).toEqual({ title: "Saved", description: "Result" });
  expect(photos).not.toHaveBeenCalled();
});
it("keeps uncertain commits recoverable and only completes after verified quota commit", async () => {
  owned.mockResolvedValue({
    ...row,
    operation_state: "pending",
    pending_result: { title: "Saved", description: "Result" },
    reservation_id: op,
  });
  commit.mockResolvedValue({ ok: false, state: "unknown" });
  await expect(recoverDraftGeneration(id, id)).rejects.toMatchObject({
    code: "generation_commit_pending",
  });
  expect(mutate).not.toHaveBeenCalled();
  commit.mockResolvedValue({ ok: true });
  await recoverDraftGeneration(id, id);
  expect(mutate).toHaveBeenCalledWith(id, "complete", {
    draftId: id,
    operationId: op,
  });
});
