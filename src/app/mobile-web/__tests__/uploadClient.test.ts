import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupUploadSession,
  createMobileUploadSession,
  uploadSelectedPhotos,
} from "../uploadClient.js";
import { prepareMobileImage } from "../imagePreparation.js";
import { refreshBrowserSession, signOutBrowser } from "../auth.js";

vi.mock("../auth.js", () => ({
  refreshBrowserSession: vi.fn(),
  signOutBrowser: vi.fn(),
}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function selectedFiles(count: number): File[] {
  return Array.from(
    { length: count },
    (_, index) =>
      new File([`photo-${index}`], `photo-${index}.jpg`, {
        type: "image/jpeg",
      }),
  );
}

describe("mobile V2 upload client", () => {
  const originalFetch = globalThis.fetch;
  const originalCreateImageBitmap = (globalThis as Record<string, unknown>)
    .createImageBitmap;
  const originalDocument = (globalThis as Record<string, unknown>).document;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(refreshBrowserSession).mockResolvedValue(null);
    vi.mocked(signOutBrowser).mockResolvedValue(undefined);
    Object.assign(globalThis, {
      createImageBitmap: vi.fn(async () => ({
        width: 100,
        height: 100,
        close: vi.fn(),
      })),
      document: {
        createElement: vi.fn(() => ({
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback: BlobCallback) =>
            callback(new Blob(["compressed"], { type: "image/jpeg" })),
        })),
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalCreateImageBitmap === undefined)
      delete (globalThis as Record<string, unknown>).createImageBitmap;
    else
      Object.assign(globalThis, {
        createImageBitmap: originalCreateImageBitmap,
      });
    if (originalDocument === undefined)
      delete (globalThis as Record<string, unknown>).document;
    else Object.assign(globalThis, { document: originalDocument });
  });

  it("prepares images at the existing 1280px and JPEG 0.8 defaults", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) =>
        callback(new Blob(["compressed"], { type: "image/jpeg" })),
      ),
    };
    const createObjectURL = vi.fn(() => "blob:preview");
    const originalCreateImageBitmap = (globalThis as Record<string, unknown>)
      .createImageBitmap;
    const originalDocument = (globalThis as Record<string, unknown>).document;
    const originalURL = (globalThis as Record<string, unknown>).URL;
    Object.assign(globalThis, {
      createImageBitmap: vi.fn(async () => ({
        width: 2560,
        height: 1280,
        close: vi.fn(),
      })),
      document: { createElement: vi.fn(() => canvas) },
      URL: { createObjectURL, revokeObjectURL: vi.fn() },
    });

    try {
      const prepared = await prepareMobileImage(
        new File(["original"], "coat.png", { type: "image/png" }),
      );
      expect(canvas.width).toBe(1280);
      expect(canvas.height).toBe(640);
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        "image/jpeg",
        0.8,
      );
      expect(prepared.file.type).toBe("image/jpeg");
      expect(prepared.previewUrl).toBe("blob:preview");
      expect(prepared.recoveredOrientation).toBe(true);
    } finally {
      if (originalCreateImageBitmap === undefined)
        delete (globalThis as Record<string, unknown>).createImageBitmap;
      else
        Object.assign(globalThis, {
          createImageBitmap: originalCreateImageBitmap,
        });
      if (originalDocument === undefined)
        delete (globalThis as Record<string, unknown>).document;
      else Object.assign(globalThis, { document: originalDocument });
      if (originalURL === undefined)
        delete (globalThis as Record<string, unknown>).URL;
      else Object.assign(globalThis, { URL: originalURL });
    }
  });

  it("rejects non-image files before creating an upload preview", async () => {
    await expect(
      prepareMobileImage(
        new File(["not an image"], "notes.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toMatchObject({ code: "unsupported-type" });
  });

  it("uses a backend-compatible v4 UUID when randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    try {
      const session = createMobileUploadSession("access-token");
      const v4 =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(session.sessionId).toMatch(v4);
      expect(session.uploaderId).toMatch(v4);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("returns a typed recovery error when HEIC cannot be decoded", async () => {
    const originalCreateImageBitmap = (globalThis as Record<string, unknown>)
      .createImageBitmap;
    const originalDocument = (globalThis as Record<string, unknown>).document;
    Object.assign(globalThis, {
      createImageBitmap: vi.fn(async () => {
        throw new Error("decoder unavailable");
      }),
      document: {},
    });

    try {
      await expect(
        prepareMobileImage(
          new File(["heic"], "photo.HEIC", { type: "image/heic" }),
        ),
      ).rejects.toMatchObject({ code: "unsupported-heic" });
    } finally {
      if (originalCreateImageBitmap === undefined)
        delete (globalThis as Record<string, unknown>).createImageBitmap;
      else
        Object.assign(globalThis, {
          createImageBitmap: originalCreateImageBitmap,
        });
      if (originalDocument === undefined)
        delete (globalThis as Record<string, unknown>).document;
      else Object.assign(globalThis, { document: originalDocument });
    }
  });

  it("preserves selected order and limits multipart uploads to three workers", async () => {
    const fetchLog: { url: string; init: RequestInit }[] = [];
    let activeMultipart = 0;
    let maxMultipart = 0;

    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      fetchLog.push({ url, init });

      if (url.includes("action=open")) return response({ success: true, v: 2 });
      if (url.includes("action=prepare"))
        return response({ success: true, v: 2 });
      if (url.includes("action=complete"))
        return response({ success: true, complete: true });
      if (url.includes("includeUrls=1")) {
        return response({
          files: [0, 1, 2, 3, 4, 5].map((order) => ({
            order,
            name: `photo-${order}.jpg`,
            url: `signed-${order}`,
          })),
        });
      }

      activeMultipart += 1;
      maxMultipart = Math.max(maxMultipart, activeMultipart);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeMultipart -= 1;
      return response({
        success: true,
        order: Number((init.body as FormData).get("uploadOrder")),
      });
    }) as typeof fetch;

    const result = await uploadSelectedPhotos(
      createMobileUploadSession("access-token"),
      selectedFiles(6),
      new AbortController().signal,
    );

    expect(maxMultipart).toBeLessThanOrEqual(3);
    expect(result.map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.map((item) => item.url)).toEqual([
      "signed-0",
      "signed-1",
      "signed-2",
      "signed-3",
      "signed-4",
      "signed-5",
    ]);
    expect(fetchLog.at(-1)?.url).toContain("v=2&includeUrls=1");
    expect(
      fetchLog.every(
        ({ init }) =>
          new Headers(init.headers).get("X-Autolister-Client") === "mobile_web",
      ),
    ).toBe(true);
  });

  it("sends the complete order manifest and does not clean up before generation", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("includeUrls=1"))
        return response({ files: [{ order: 0, url: "signed-0" }] });
      return response({ success: true, complete: true });
    }) as typeof fetch;

    await uploadSelectedPhotos(
      createMobileUploadSession("access-token"),
      selectedFiles(1),
      new AbortController().signal,
    );

    const complete = calls.find(({ url }) => url.includes("action=complete"));
    expect(JSON.parse(String(complete?.init.body))).toEqual({ orders: [0] });
    expect(calls.some(({ url }) => url.includes("action=cleanup"))).toBe(false);
  });

  it("polls when V2 completion is still settling before fetching signed URLs", async () => {
    let completeAttempts = 0;
    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      if (url.includes("action=complete")) {
        completeAttempts += 1;
        return completeAttempts === 1
          ? response({ success: false, complete: false, settling: true }, 202)
          : response({ success: true, complete: true });
      }
      if (url.includes("includeUrls=1"))
        return response({ files: [{ order: 0, url: "signed-0" }] });
      return response({ success: true });
    }) as typeof fetch;

    await uploadSelectedPhotos(
      createMobileUploadSession("access-token"),
      selectedFiles(1),
      new AbortController().signal,
    );

    expect(completeAttempts).toBe(2);
  });

  it("reports completed uploads while preserving the selected order", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("includeUrls=1"))
        return response({
          files: [0, 1, 2].map((order) => ({
            order,
            url: `signed-${order}`,
          })),
        });
      return response({ success: true, complete: true });
    }) as typeof fetch;
    const progress: Array<{ completed: number; total: number }> = [];

    await uploadSelectedPhotos(
      createMobileUploadSession("access-token"),
      selectedFiles(3),
      new AbortController().signal,
      (update) => progress.push(update),
    );

    expect(progress).toEqual([
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
      { completed: 3, total: 3 },
    ]);
  });

  it("cancels the V2 session when an upload is aborted", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let uploadStarted = false;
    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("action=open")) return response({ success: true, v: 2 });
      if (url.includes("action=prepare"))
        return response({ success: true, v: 2 });
      if (url.includes("action=cleanup"))
        return response({ success: true, status: "cancelled" });
      if (!uploadStarted) {
        uploadStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return response({ success: true });
    }) as typeof fetch;

    const controller = new AbortController();
    const pending = uploadSelectedPhotos(
      createMobileUploadSession("access-token"),
      selectedFiles(6),
      controller.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    const cleanup = calls.find(({ url }) => url.includes("action=cleanup"));
    expect(cleanup?.url).toContain("v=2&reason=cancelled");
    expect(cleanup?.init.body).toBe("{}");
  });

  it("cancels after an uncertain open response", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("action=open"))
        throw new TypeError("connection closed after request");
      if (url.includes("action=cleanup"))
        return response({ success: true, status: "cancelled" });
      return response({ success: true });
    }) as typeof fetch;

    await expect(
      uploadSelectedPhotos(
        createMobileUploadSession("access-token"),
        selectedFiles(1),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "network_error" });

    expect(calls.some(({ url }) => url.includes("action=cleanup"))).toBe(true);
  });

  it("refreshes once when the upload session receives a 401", async () => {
    vi.mocked(refreshBrowserSession).mockResolvedValue({
      access_token: "refreshed-token",
    } as never);
    const authHeaders: string[] = [];
    let openAttempts = 0;
    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      authHeaders.push(new Headers(init.headers).get("Authorization") || "");
      if (url.includes("action=open")) {
        openAttempts += 1;
        if (openAttempts === 1) return response({ error: "expired" }, 401);
        return response({ success: true, v: 2 });
      }
      if (url.includes("action=prepare")) return response({ success: true });
      if (url.includes("action=complete"))
        return response({ success: true, complete: true });
      if (url.includes("includeUrls=1"))
        return response({ files: [{ order: 0, url: "signed-0" }] });
      return response({ success: true });
    }) as typeof fetch;

    const result = await uploadSelectedPhotos(
      createMobileUploadSession("expired-token"),
      selectedFiles(1),
      new AbortController().signal,
    );

    expect(result[0]?.url).toBe("signed-0");
    expect(openAttempts).toBe(2);
    expect(authHeaders.slice(0, 2)).toEqual([
      "Bearer expired-token",
      "Bearer refreshed-token",
    ]);
    expect(signOutBrowser).not.toHaveBeenCalled();
  });

  it("signs out when the refreshed upload request is still unauthorized", async () => {
    vi.mocked(refreshBrowserSession).mockResolvedValue({
      access_token: "still-invalid-token",
    } as never);
    let openAttempts = 0;
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("action=open")) {
        openAttempts += 1;
        return response({ error: "expired" }, 401);
      }
      if (url.includes("action=cleanup"))
        return response({ success: true, status: "cancelled" });
      return response({ success: true });
    }) as typeof fetch;

    await expect(
      uploadSelectedPhotos(
        createMobileUploadSession("expired-token"),
        selectedFiles(1),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 401 });

    expect(openAttempts).toBe(2);
    expect(signOutBrowser).toHaveBeenCalledTimes(1);
  });

  it("uses ordinary cleanup only when explicitly asked after generation", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      response({ success: true }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const session = createMobileUploadSession("access-token");

    await cleanupUploadSession(session, "post-generation");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "action=cleanup&v=2",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain(
      "reason=cancelled",
    );
  });
});
