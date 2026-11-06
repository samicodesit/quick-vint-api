import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    rpc: m.rpc,
    storage: { from: () => ({ createSignedUrl: m.sign }) },
  },
}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
import { getListingPhotoJob } from "../../../utils/listingPhotoJobs";
const job = (state = "running") => ({
  kind: "listing",
  state,
  expires_at: new Date(Date.now() + 60000).toISOString(),
  source_expires_at: new Date(Date.now() + 60000).toISOString(),
  retry_count: 0,
  payload: {
    plan: { eligible: true },
    primary: { state: "ready", key: "accepted-front" },
    secondary: {
      state: "rejected",
      candidateKey: "rejected-back",
      key: "unsafe",
    },
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  m.sign.mockImplementation(async (key) => ({
    data: { signedUrl: `https://photos.example/${key}` },
  }));
});
it.each(["running", "queued", "failed", "ready"])(
  "exposes only validated slots while %s",
  async (state) => {
    m.rpc.mockResolvedValue({ data: job(state) });
    const result = await getListingPhotoJob("owner", "job");
    expect(result).toHaveProperty("photos", [
      {
        id: "job-primary",
        slot: "primary",
        url: "https://photos.example/accepted-front",
      },
    ]);
    expect(m.sign).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("listing_photo_mutate", {
      p_user_id: "owner",
      p_action: "get",
      p_input: { id: "job" },
    });
  },
);
it.each(["cancelled", "skipped"])(
  "does not expose photos for %s jobs",
  async (state) => {
    m.rpc.mockResolvedValue({ data: job(state) });
    expect(await getListingPhotoJob("owner", "job")).not.toHaveProperty(
      "photos",
    );
    expect(m.sign).not.toHaveBeenCalled();
  },
);
it("does not sign expired jobs or missing ownership", async () => {
  m.rpc
    .mockResolvedValueOnce({ data: { ...job(), expires_at: "2020-01-01" } })
    .mockResolvedValueOnce({ data: null });
  expect(await getListingPhotoJob("owner", "job")).not.toHaveProperty("photos");
  expect(await getListingPhotoJob("other", "job")).toBeNull();
  expect(m.sign).not.toHaveBeenCalled();
});
