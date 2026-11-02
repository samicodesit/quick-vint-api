import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  list: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { storage: { from: () => storage } },
}));
const session = "00000000-0000-4000-8000-000000000001";
const path = `${session}/000000-upload.jpg`;
const now = Date.parse("2026-11-02T20:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  process.env.VERCEL_APP_SUPABASE_URL = "https://project.supabase.co";
  storage.move.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  storage.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "private-signed-url" },
    error: null,
  });
});

it("records the exact model input hash, strips tokens, and refuses external or inline retention", async () => {
  const { buildInputPhotoReview } =
    await import("../../../utils/inputPhotoReview.js");
  const result = buildInputPhotoReview(
    [
      `https://project.supabase.co/storage/v1/object/sign/temp-uploads/${path}?token=secret`,
      `https://other.supabase.co/storage/v1/object/sign/temp-uploads/${path}`,
      "data:image/jpeg;base64,YQ==",
    ],
    [
      "data:image/jpeg;base64,cGhvdG8=",
      "data:image/jpeg;base64,Yg==",
      "data:image/jpeg;base64,YQ==",
    ],
    now,
  );
  expect(result).toEqual({
    v: 1,
    expiresAt: new Date(now + 86400000).toISOString(),
    images: [
      {
        index: 0,
        path,
        sha256: createHash("sha256").update("photo").digest("hex"),
      },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(/secret|base64|other/);
});

it("moves existing objects without copying bytes and keeps the original upload deadline", async () => {
  const { retireUploadFiles } =
    await import("../../../utils/inputPhotoReview.js");
  const created = new Date(now - 3600000).toISOString();
  await retireUploadFiles(
    session,
    [
      { name: "000000-upload.jpg", created_at: created },
      { name: "_session.json", created_at: created },
    ],
    now,
  );
  expect(storage.move).toHaveBeenCalledWith(
    path,
    `_review-${session}/${now + 23 * 3600000}-000000-upload.jpg`,
  );
  expect(storage.remove).toHaveBeenCalledWith([`${session}/_session.json`]);
});

it("does not delete originals after a failed archive move", async () => {
  const { retireUploadFiles } =
    await import("../../../utils/inputPhotoReview.js");
  storage.move.mockResolvedValue({ error: { message: "unavailable" } });
  await expect(
    retireUploadFiles(
      session,
      [{ name: "000000-upload.jpg", created_at: new Date(now).toISOString() }],
      now,
    ),
  ).rejects.toThrow();
  expect(storage.remove).not.toHaveBeenCalled();
});

it("deletes expired originals instead of restarting retention", async () => {
  const { retireUploadFiles } =
    await import("../../../utils/inputPhotoReview.js");
  await retireUploadFiles(
    session,
    [
      {
        name: "000000-upload.jpg",
        created_at: new Date(now - 86400000).toISOString(),
      },
    ],
    now,
  );
  expect(storage.move).not.toHaveBeenCalled();
  expect(storage.remove).toHaveBeenCalledWith([path]);
});

it("clamps admin URLs to the upload deadline and never signs expired evidence", async () => {
  const { signInputPhotoReview } =
    await import("../../../utils/inputPhotoReview.js");
  storage.list.mockImplementation(async (prefix: string) => ({
    data: prefix.startsWith("_review-")
      ? [{ name: `${now + 45000}-000000-upload.jpg` }]
      : [],
    error: null,
  }));
  const log = {
    created_at: new Date(now - 3600000).toISOString(),
    full_request_body: {
      inputPhotoReview: {
        v: 1,
        expiresAt: new Date(now + 86400000).toISOString(),
        images: [{ index: 0, path, sha256: "a".repeat(64) }],
      },
    },
  };
  const result = await signInputPhotoReview(log, now);
  expect(result[0]).toMatchObject({
    sha256: "a".repeat(64),
    expiresAt: new Date(now + 45000).toISOString(),
    signedUrl: "private-signed-url",
  });
  expect(storage.createSignedUrl).toHaveBeenCalledWith(
    `_review-${session}/${now + 45000}-000000-upload.jpg`,
    45,
  );
  storage.createSignedUrl.mockClear();
  expect(await signInputPhotoReview(log, now + 86400000)).toEqual([]);
  expect(storage.createSignedUrl).not.toHaveBeenCalled();
});
