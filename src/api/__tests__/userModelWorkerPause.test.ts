import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  warm: vi.fn(),
  rpc: vi.fn(),
  generate: vi.fn(),
  check: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("../../../utils/listingPhotoJobs", () => ({
  photoAccess: m.access,
  warmRearModel: m.warm,
  listingPhotosEnabled: () => true,
}));
vi.mock("../../../utils/userModelGeneration", async (original) => ({
  ...(await original<typeof import("../../../utils/userModelGeneration")>()),
  generateModelImage: m.generate,
  checkModelImage: m.check,
  uploadModelImage: m.upload,
}));
import { processUserModel } from "../../../utils/userModels";
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({ data: null, error: null });
});
it("does not claim or generate a queued model for a paused account", async () => {
  m.access.mockResolvedValue(false);
  await processUserModel("owner", "operation");
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.generate).not.toHaveBeenCalled();
  expect(m.warm).not.toHaveBeenCalled();
});
it("keeps eligible queued work resumable", async () => {
  m.access.mockResolvedValue(true);
  await processUserModel("owner", "operation");
  expect(m.rpc).toHaveBeenCalledWith(
    "user_model_mutate",
    expect.objectContaining({ p_action: "claim" }),
  );
});
