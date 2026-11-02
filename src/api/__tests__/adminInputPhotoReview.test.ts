import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  single: vi.fn(),
  list: vi.fn(),
  createSignedUrl: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
    storage: {
      from: () => ({
        list: mocks.list,
        createSignedUrl: mocks.createSignedUrl,
      }),
    },
  },
}));
vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return {};
  }),
}));
import handler from "../../../api/admin/index.js";
const session = "00000000-0000-4000-8000-000000000001";
const path = `${session}/000000-upload.jpg`;
beforeEach(() => {
  vi.resetAllMocks();
  process.env.ADMIN_SECRET = "admin-secret";
  mocks.single.mockResolvedValue({
    error: null,
    data: {
      id: "log",
      created_at: new Date().toISOString(),
      full_request_body: {
        inputPhotoReview: {
          v: 1,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          images: [{ index: 0, path, sha256: "a".repeat(64) }],
        },
      },
    },
  });
  mocks.list.mockImplementation(async (prefix: string) => ({
    error: null,
    data: prefix.startsWith("_review-")
      ? [{ name: `${Date.now() + 3600000}-000000-upload.jpg` }]
      : [],
  }));
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "private-photo" },
    error: null,
  });
});
function response() {
  return {
    body: null as any,
    code: 0,
    setHeader: vi.fn(),
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
  };
}
it("exposes bounded photo proof only through authenticated log-detail", async () => {
  const denied = response();
  await handler(
    {
      method: "GET",
      headers: {},
      query: { action: "log-detail", id: "log" },
    } as any,
    denied as any,
  );
  expect(denied.code).toBe(401);
  expect(mocks.single).not.toHaveBeenCalled();
  const res = response();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer admin-secret" },
      query: { action: "log-detail", id: "log" },
    } as any,
    res as any,
  );
  expect(res.code).toBe(200);
  expect(res.body.log.inputPhotoReviewImages[0]).toMatchObject({
    path,
    sha256: "a".repeat(64),
    signedUrl: "private-photo",
  });
  expect(res.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store",
  );
});
it("preserves the log detail when photo storage is unavailable", async () => {
  mocks.list.mockResolvedValue({ error: { message: "storage down" } });
  const res = response();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer admin-secret" },
      query: { action: "log-detail", id: "log" },
    } as any,
    res as any,
  );
  expect(res.code).toBe(200);
  expect(res.body.log.inputPhotoReviewStatus).toBe("storage_unavailable");
  expect(mocks.createSignedUrl).not.toHaveBeenCalled();
});
