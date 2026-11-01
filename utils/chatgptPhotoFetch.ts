/* global Response, Headers, ReadableStream */
import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import { Readable } from "node:stream";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");

export function safePhotoUrl(value: string): URL {
  const url = new URL(value);
  // The prefix restricts sources; it does not attest ownership. Pin public DNS too.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      /^oaisdmntpr[a-z0-9]{1,15}\.blob\.core\.windows\.net$/.test(
        url.hostname,
      ) ||
      url.hostname === "files.openai.com" ||
      url.hostname === "oaiusercontent.com" ||
      url.hostname.endsWith(".oaiusercontent.com") ||
      (url.hostname === "chatgpt.com" &&
        url.pathname === "/backend-api/estuary/content")
    )
  )
    throw new Error("Unsupported photo source.");
  return url;
}

export function publicPhotoLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (...args: any[]) => void,
) {
  lookup(hostname, { all: true, family: 4 }, (error, addresses) => {
    if (error) return callback(error);
    if (
      !addresses.length ||
      addresses.some(
        (a) => isIP(a.address) !== 4 || blocked.check(a.address, "ipv4"),
      )
    ) {
      return callback(
        new Error("Photo source must resolve to public IPv4 addresses."),
      );
    }
    const chosen = addresses[0];
    if (options.all) callback(null, [chosen]);
    else callback(null, chosen.address, 4);
  });
}

export function fetchChatGPTPhoto(
  value: string,
  options: { signal: AbortSignal },
): Promise<Response> {
  const url = safePhotoUrl(value);
  return new Promise((resolve, reject) => {
    // No redirects, cookies, bearer credentials, connection reuse or DNS relookup.
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        family: 4,
        lookup: publicPhotoLookup,
        signal: options.signal,
        headers: { "accept-encoding": "identity" },
      },
      (res) => {
        const encoding = res.headers["content-encoding"];
        if (encoding && encoding !== "identity") {
          res.destroy();
          reject(new Error("Encoded photo response denied."));
          return;
        }
        const headers = new Headers();
        for (const name of ["content-length", "content-type"]) {
          const val = res.headers[name];
          if (typeof val === "string") headers.set(name, val);
        }
        try {
          const status = res.statusCode || 502;
          const bodyless = [204, 205, 304].includes(status);
          if (bodyless) res.destroy();
          resolve(
            new Response(
              bodyless
                ? null
                : (Readable.toWeb(res) as ReadableStream<Uint8Array>),
              { status, headers },
            ),
          );
        } catch (error) {
          res.destroy();
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end();
  });
}
