import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  pause: vi.fn(),
  access: vi.fn(),
  get: vi.fn(),
  mutate: vi.fn(),
  process: vi.fn(),
  admit: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { auth: { getUser: m.auth } },
}));
vi.mock("../../../utils/listingPhotoJobs", () => ({
  admitPhotoOnly: m.admit,
  validPhotoSource: (s: string) => s.startsWith("data:image/jpeg;base64,"),
  photoAccess: m.access,
  getListingPhotoJob: m.get,
  photoMutate: m.mutate,
  processListingPhotoJob: m.process,
  listingPhotosEnabled: () =>
    process.env.LISTING_MODEL_PHOTOS_ENABLED === "true",
}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount: m.pause,
}));
vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: { extractRequestMetadata: () => ({ ipAddress: "1.2.3.4" }) },
}));
import handler from "../../../api/listing-model-photos";
const id = "f61d1098-af80-4053-b503-e7c70fefb290";
async function call(
  method = "GET",
  body: any = {},
  headers: any = { authorization: "Bearer valid" },
) {
  const res: any = {
    statusCode: 200,
    setHeader: vi.fn(),
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler({ method, body, headers, query: { id } } as any, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.LISTING_MODEL_PHOTOS_ENABLED = "true";
  m.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  m.access.mockResolvedValue(true);
  m.pause.mockResolvedValue({ paused: false });
  m.get.mockResolvedValue({ jobId: id, status: "generating" });
  m.mutate.mockResolvedValue({ id });
  m.process.mockResolvedValue(undefined);
});
it("requires authentication and validates origin/owner input", async () => {
  expect((await call("GET", {}, {})).statusCode).toBe(401);
  expect(
    (
      await call(
        "GET",
        {},
        { authorization: "Bearer valid", origin: "https://evil.example" },
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (await call("POST", { id, action: "retry", userId: "other" })).statusCode,
  ).toBe(400);
  expect(m.mutate).not.toHaveBeenCalled();
});
it("GET only reads owned status; resume and retry require POST", async () => {
  expect((await call()).body.status).toBe("generating");
  expect(m.process).not.toHaveBeenCalled();
  await call("POST", { id, action: "retry" });
  expect(m.mutate).toHaveBeenCalledWith("owner", "retry", { id });
  expect(m.process).toHaveBeenCalledWith("owner", id);
});
it("returns the first validated photo while the other is still generating", async () => {
  const state = {
    jobId: id,
    status: "generating",
    eligible: true,
    photos: [
      {
        id: `${id}-primary`,
        slot: "primary",
        url: "https://photos.example/accepted.jpg",
      },
    ],
  };
  m.get.mockResolvedValue(state);
  expect((await call()).body).toEqual(state);
  expect(m.get).toHaveBeenCalledWith("owner", id);
  expect(m.process).not.toHaveBeenCalled();
});
it("does not restart work for paused accounts or when feature is disabled", async () => {
  m.access.mockResolvedValue(false);
  expect((await call("POST", { id, action: "resume" })).statusCode).toBe(403);
  expect(m.process).not.toHaveBeenCalled();
  process.env.LISTING_MODEL_PHOTOS_ENABLED = "false";
  expect((await call()).statusCode).toBe(404);
});
it("records owned attachment outcomes without starting provider work", async () => {
  await call("POST", { id, action: "attachment_failed" });
  expect(m.mutate).toHaveBeenCalledWith("owner", "attachment_failed", { id });
  expect(m.process).not.toHaveBeenCalled();
});
it("admits a photos-only request without accepting a client allowance or owner", async () => {
  m.admit.mockResolvedValue({ jobId: id, status: "queued" });
  const sources = ["data:image/jpeg;base64,YQ=="];
  expect(
    (await call("POST", { action: "create", sources, sourceKey: "revision" }))
      .body.jobId,
  ).toBe(id);
  expect(m.admit).toHaveBeenCalledWith("owner", sources, "revision");
  expect(
    (await call("POST", { action: "create", sources, allowance: 999 }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await call("POST", {
        action: "create",
        sources: ["http://localhost/secret"],
      })
    ).statusCode,
  ).toBe(400);
});

it.each(["create", "retry", "resume"])(
  "checks shared-IP pause before photo %s work",
  async (action) => {
    m.pause.mockResolvedValue({ paused: true, reason: "duplicate_ip_signup" });
    const body =
      action === "create"
        ? { action, sources: ["data:image/jpeg;base64,YQ=="] }
        : { action, id };
    expect((await call("POST", body)).statusCode).toBe(403);
    expect(m.admit).not.toHaveBeenCalled();
    expect(m.mutate).not.toHaveBeenCalled();
    expect(m.process).not.toHaveBeenCalled();
  },
);
