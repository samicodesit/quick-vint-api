import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
const { user, photo, upload, mutate, complete } = vi.hoisted(() => ({
  user: vi.fn(),
  photo: vi.fn(),
  upload: vi.fn(),
  mutate: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { auth: { getUser: user }, storage: { from: () => ({ upload }) } },
}));
vi.mock("../../../utils/listingDrafts", () => ({
  ownedPhoto: photo,
  mutateDraft: mutate,
  handleDraftAction: complete,
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
import handler from "../../../api/draft-photo";
const id = "123e4567-e89b-42d3-a456-426614174000";
function response() {
  const res: any = {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status: (s: number) => {
      res.statusCode = s;
      return res;
    },
    json: (v: any) => {
      res.body = v;
      return res;
    },
    end: () => res,
  };
  return res;
}
function request(buffer: Buffer, headers: Record<string, string> = {}) {
  return Object.assign(Readable.from([buffer]), {
    method: "PUT",
    query: { photoId: id },
    headers: {
      authorization: "Bearer valid",
      "content-type": "image/jpeg",
      ...headers,
    },
  }) as any;
}
beforeEach(() => {
  vi.clearAllMocks();
  user.mockResolvedValue({ data: { user: { id } }, error: null });
  photo.mockResolvedValue({
    id,
    bytes: 6,
    object_key: "private/object.jpg",
    status: "pending",
    grant_expires_at: new Date(Date.now() + 7200000).toISOString(),
  });
  upload.mockResolvedValue({ error: null });
  complete.mockResolvedValue({ id, status: "ready" });
});
it("verifies the exact reserved bytes and JPEG before storing any object", async () => {
  const res = response();
  await handler(request(Buffer.from([255, 216, 255, 0, 255, 217])), res);
  expect(res.statusCode).toBe(200);
  expect(upload).toHaveBeenCalledWith(
    "private/object.jpg",
    expect.any(Buffer),
    { contentType: "image/jpeg", upsert: false },
  );
  expect(mutate).toHaveBeenCalledWith(
    id,
    "completeUpload",
    expect.objectContaining({
      photoId: id,
      bytes: 6,
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
  const tooLarge = response();
  await handler(request(Buffer.alloc(7)), tooLarge);
  expect(tooLarge.statusCode).toBe(400);
  expect(upload).toHaveBeenCalledTimes(1);
  const invalid = response();
  await handler(request(Buffer.alloc(6)), invalid);
  expect(invalid.statusCode).toBe(400);
  expect(upload).toHaveBeenCalledTimes(1);
});
it("rejects unauthenticated uploads before reading or writing storage", async () => {
  const res = response();
  await handler(request(Buffer.alloc(6), { authorization: "" }), res);
  expect(res.statusCode).toBe(401);
  expect(photo).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
it("rejects expired upload reservations before writing storage", async () => {
  photo.mockResolvedValue({
    id,
    bytes: 6,
    status: "pending",
    grant_expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const res = response();
  await handler(request(Buffer.from([255, 216, 255, 0, 255, 217])), res);
  expect(res.statusCode).toBe(409);
  expect(res.body.code).toBe("photo_expired");
  expect(upload).not.toHaveBeenCalled();
});
