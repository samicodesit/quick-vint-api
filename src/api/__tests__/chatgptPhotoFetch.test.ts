import { describe, expect, it, vi, afterEach } from "vitest";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
const lookup = vi.hoisted(() => vi.fn());
const request = vi.hoisted(() => vi.fn());
vi.mock("node:dns", () => ({ lookup }));
vi.mock("node:https", () => ({ request }));
import {
  fetchChatGPTPhoto,
  publicPhotoLookup,
  safePhotoUrl,
} from "../../../utils/chatgptPhotoFetch";
afterEach(() => vi.clearAllMocks());
describe("private photo connection policy", () => {
  it.each([
    "oaisdmntprnewregion.blob.core.windows.net",
    "files.openai.com",
    "a.oaiusercontent.com",
  ])("accepts bounded public image host %s", (host) => {
    expect(safePhotoUrl(`https://${host}/photo?sig=secret`).hostname).toBe(
      host,
    );
  });
  it.each([
    "https://attacker.blob.core.windows.net/a",
    "https://oaisdmntprnewregion.blob.core.windows.net.evil.test/a",
    "http://files.openai.com/a",
    "https://user:pass@files.openai.com/a",
    "https://files.openai.com:444/a",
  ])("rejects URL %s", (url) => expect(() => safePhotoUrl(url)).toThrow());
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "100.64.0.1",
    "0.0.0.0",
    "198.18.0.1",
    "224.0.0.1",
    "::ffff:127.0.0.1",
  ])("rejects non-public DNS answer %s", async (address) => {
    lookup.mockImplementation((_h, _o, cb) =>
      cb(null, [{ address, family: 4 }]),
    );
    const cb = vi.fn();
    publicPhotoLookup("files.openai.com", {}, cb);
    expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
  });
  it("pins only the checked IPv4 address and rejects mixed public/private answers", () => {
    lookup.mockImplementation((_h, _o, cb) =>
      cb(null, [{ address: "20.60.1.2", family: 4 }]),
    );
    const cb = vi.fn();
    publicPhotoLookup("files.openai.com", {}, cb);
    expect(lookup).toHaveBeenCalledWith(
      "files.openai.com",
      { all: true, family: 4 },
      expect.any(Function),
    );
    expect(cb).toHaveBeenCalledWith(null, "20.60.1.2", 4);
    lookup.mockImplementation((_h, _o, done) =>
      done(null, [
        { address: "20.60.1.2", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    );
    const mixed = vi.fn();
    publicPhotoLookup("files.openai.com", {}, mixed);
    expect(mixed.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("HTTPS photo transport", () => {
  function upstream(status = 200, headers = {}) {
    const response = Object.assign(Readable.from([Buffer.from("photo")]), {
      statusCode: status,
      headers,
    });
    const req = Object.assign(new EventEmitter(), { end: vi.fn() });
    request.mockImplementation((_url, _options, callback) => {
      req.end.mockImplementation(() => callback(response));
      return req;
    });
    return { response, req };
  }
  it.each([204, 205, 304])(
    "handles bodyless status %s without uncaught errors",
    async (status) => {
      const { response } = upstream(status);
      const result = await fetchChatGPTPhoto("https://files.openai.com/a", {
        signal: new AbortController().signal,
      });
      expect(result.status).toBe(status);
      expect(result.body).toBeNull();
      expect(response.destroyed).toBe(true);
    },
  );
  it("rejects compressed responses and destroys upstream", async () => {
    const { response } = upstream(200, { "content-encoding": "gzip" });
    await expect(
      fetchChatGPTPhoto("https://files.openai.com/a", {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Encoded");
    expect(response.destroyed).toBe(true);
  });
  it("passes the abort signal and connection-pinned lookup to HTTPS and propagates abort", async () => {
    const { req } = upstream();
    req.end.mockImplementation(() => {});
    request.mockImplementation((_url, _options, _callback) => req);
    const controller = new AbortController();
    const pending = fetchChatGPTPhoto("https://files.openai.com/a", {
      signal: controller.signal,
    });
    expect(request.mock.calls[0][1]).toMatchObject({
      signal: controller.signal,
      lookup: publicPhotoLookup,
      agent: false,
      family: 4,
    });
    const assertion = expect(pending).rejects.toThrow("aborted");
    controller.abort();
    req.emit("error", new Error("aborted"));
    await assertion;
  });
});
