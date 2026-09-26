import { signVintedRequest, type VintedKeys } from "./signing";

export const VINTED_CONTRACT_VERSION = "v0.360.0";
export const VINTED_CONTRACT_SHA256 =
  "d79338ab2f1a3be0c3817a1d45b5d5f5f773996eaba62848ad2354821adbe831";

export type VintedEnvironment = "sandbox" | "production";
const hosts: Record<VintedEnvironment, string> = {
  sandbox: "https://pro-public-sandbox.svc.vinted.com",
  production: "https://pro.svc.vinted.com",
};

// JSON.parse rounds int64 order IDs. Quote long integer tokens outside JSON strings
// before parsing so every external identity stays exact.
export function parseVintedJson(text: string): unknown {
  let quoted = false;
  let escaped = false;
  let result = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      result += char;
      continue;
    }
    if (/[-\d]/.test(char)) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
        text.slice(i),
      );
      if (match) {
        const token = match[0];
        result += /^-?\d{16,}$/.test(token) ? `"${token}"` : token;
        i += token.length - 1;
        continue;
      }
    }
    result += char;
  }
  return JSON.parse(result) as unknown;
}

export class VintedClient {
  constructor(
    private readonly keys: VintedKeys,
    private readonly environment: VintedEnvironment,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    pathWithQuery: string,
    payload?: unknown,
  ): Promise<{ status: number; data: unknown; headers: globalThis.Headers }> {
    if (!/^\/api\/v1\/[a-z0-9_/?=&%-]+$/.test(pathWithQuery))
      throw new Error("Unsupported Vinted API path");
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const signature = signVintedRequest(
      this.keys,
      method,
      pathWithQuery,
      body,
      Math.floor(this.clock() / 1000),
    );
    const headers: Record<string, string> = {
      "X-Vpi-Access-Key": this.keys.accessKey,
      "X-Vpi-Hmac-Sha256": signature,
      Accept: "application/json",
    };
    if (body) headers["Content-Type"] = "application/json";
    const response = await this.fetcher(
      `${hosts[this.environment]}${pathWithQuery}`,
      {
        method,
        headers,
        body: body || undefined,
        signal: globalThis.AbortSignal.timeout(12_000),
      },
    );
    const type = response.headers.get("content-type") ?? "";
    const data = type.includes("application/pdf")
      ? new Uint8Array(await response.arrayBuffer())
      : type.includes("json")
        ? parseVintedJson(await response.text())
        : await response.text();
    return { status: response.status, data, headers: response.headers };
  }
}
