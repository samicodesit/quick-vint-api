import { describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  list: vi.fn(),
  createSignedUrl: vi.fn(),
  createSignedUrls: vi.fn(),
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: { storage: { from: () => storage } },
}));
vi.mock("../../../utils/incidents/service", () => ({
  continueIncidentWork: vi.fn(),
}));
vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: vi.fn(),
}));
import handler from "../../../api/phone-upload";

describe("legacy upload listing signing pressure", () => {
  it("lists a large computer upload without one concurrent storage request per photo", async () => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440099";
    const photos = Array.from({ length: 307 }, (_, order) => ({
      name: `${String(order).padStart(6, "0")}-upload.jpg`,
      metadata: { size: 100 + order, mimetype: "image/jpeg" },
    })).reverse();
    let active = 0;
    let peak = 0;
    const sign = async (paths: string[]) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return paths.map((path) => ({
        path,
        signedUrl: `https://storage.invalid/${path}`,
        error: null,
      }));
    };
    storage.list.mockImplementation(async (_sessionId, { offset, limit }) => ({
      data: photos.slice(offset, offset + limit),
      error: null,
    }));
    storage.createSignedUrl.mockImplementation(async (path: string) => ({
      data: (await sign([path]))[0],
      error: null,
    }));
    storage.createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: (await sign(paths)).reverse(),
      error: null,
    }));
    const res: any = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      end() {},
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    await handler(
      { method: "GET", headers: {}, query: { sessionId } } as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(307);
    expect(res.body.files).toEqual(
      [...photos].reverse().map((photo, order) => ({
        name: photo.name,
        path: `${sessionId}/${photo.name}`,
        order,
        size: 100 + order,
        type: "image/jpeg",
        url: `https://storage.invalid/${sessionId}/${photo.name}`,
      })),
    );
    // Storage is isolated. This measures the application's actual fanout,
    // without inventing a provider capacity limit or a historical root cause.
    expect(peak).toBe(1);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(
      photos.map((photo) => `${sessionId}/${photo.name}`),
      3600,
    );
  });
});
