/* global Response, btoa, atob, TextEncoder, TextDecoder, crypto, URL, Blob, fetch, AbortSignal */
const editor = "",
  widget = "",
  assets = {};
const FILE = {
  type: "object",
  properties: Object.fromEntries(
    ["download_url", "file_id", "file_name", "mime_type"].map((k) => [
      k,
      { type: "string" },
    ]),
  ),
  required: ["download_url", "file_id"],
  additionalProperties: false,
};
const uri = "ui://autolister/item-v1.html";
const tool = {
  name: "prepare_item",
  title: "Prepare one Vinted draft",
  description:
    "Prepare one editable AutoLister draft from 1 to 4 attached photos of the same item, taken together. If photos show several items, ask the seller which group to use. Inspect the images to write a concise title and description from readable labels and visible features. Omit guessed composition, size, condition and wear history. Do not include a seller note in these fields: the signed-in AutoLister editor applies the saved note when opened. Return the exact Open draft in AutoLister link from the tool result to the seller.",
  inputSchema: {
    type: "object",
    $defs: { OpenAIFile: FILE },
    properties: {
      photos: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { $ref: "#/$defs/OpenAIFile" },
      },
      title: { type: "string", maxLength: 150 },
      description: { type: "string", maxLength: 4000 },
    },
    required: ["photos", "title", "description"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  _meta: { "openai/fileParams": ["photos"] },
};
const headers = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
const json = (x, status = 200) => Response.json(x, { status, headers });
const encode = (x) =>
  btoa(String.fromCharCode(...new Uint8Array(x)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decode = (x) =>
  Uint8Array.from(atob(x.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const utf = new TextEncoder();
async function cipher(env) {
  if (!/^[a-f0-9]{64}$/.test(env.HANDOFF_KEY || ""))
    throw Error("Configuration unavailable.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(env.HANDOFF_KEY.match(/../g), (v) => parseInt(v, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
function fileURL(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      [
        "oaisdmntprnortheu.blob.core.windows.net",
        "oaisdmntprsoutheastus3.blob.core.windows.net",
      ].includes(url.hostname) ||
      url.hostname === "files.openai.com" ||
      url.hostname.endsWith(".oaiusercontent.com") ||
      url.hostname === "oaiusercontent.com" ||
      (url.hostname === "chatgpt.com" &&
        url.pathname === "/backend-api/estuary/content")
    )
  ) {
    const host = url.hostname.slice(0, 120);
    throw Error("Unsupported attachment host: " + url.protocol + "//" + host);
  }
  return url.href;
}
function check(args) {
  if (
    typeof args.title !== "string" ||
    !args.title.trim() ||
    args.title.length > 150 ||
    typeof args.description !== "string" ||
    !args.description.trim() ||
    args.description.length > 4000
  )
    throw Error("Provide a title and description for one item.");
  if (
    !Array.isArray(args.photos) ||
    args.photos.length < 1 ||
    args.photos.length > 4
  )
    throw Error("Attach 1 to 4 photos of one item.");
  const ids = new Set();
  const photos = args.photos.map((p) => {
    const reason = !p
      ? "absent"
      : typeof p.file_id !== "string" || !p.file_id
        ? "missing file id"
        : p.file_id.length > 512
          ? "id too large"
          : ids.has(p.file_id)
            ? "repeated file id"
            : typeof p.download_url !== "string" || !p.download_url
              ? "missing download reference"
              : p.download_url.length > 12000
                ? "reference too large"
                : "";
    if (reason) {
      throw Error(
        "Attach original photos using the ChatGPT file picker (" +
          reason +
          ").",
      );
    }
    ids.add(p.file_id);
    if (
      p.mime_type &&
      !["image/jpeg", "image/png", "image/webp"].includes(p.mime_type)
    )
      throw Error("Choose JPEG, PNG or WebP photos.");
    try {
      return { id: p.file_id, url: fileURL(p.download_url) };
    } catch (error) {
      // Unknown regional blob accounts never receive an outbound request.
      const u = new URL(p.download_url);
      if (
        u.protocol === "https:" &&
        !u.port &&
        !u.username &&
        !u.password &&
        /^oaisdmntpr[a-z0-9]+\.blob\.core\.windows\.net$/.test(u.hostname)
      ) {
        // Host-only diagnostics: never log signed URLs, file IDs or seller data.
        console.warn("chatgpt_attachment_host_unrecognized", u.hostname);
        return { id: p.file_id, reselect: true };
      }
      throw error;
    }
  });
  return {
    title: args.title.trim(),
    description: args.description.trim(),
    photos,
  };
}
async function seal(item, user, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const stable = await crypto.subtle.digest(
    "SHA-256",
    utf.encode(
      JSON.stringify([
        user,
        item.title,
        item.description,
        item.photos.map((p) => p.id),
      ]),
    ),
  );
  const hex = [...new Uint8Array(stable)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const id =
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-4" +
    hex.slice(13, 16) +
    "-8" +
    hex.slice(17, 20) +
    "-" +
    hex.slice(20, 32);
  const body = utf.encode(
    JSON.stringify({ ...item, id, until: Date.now() + 15 * 60 * 1000 }),
  );
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf.encode(user) },
    await cipher(env),
    body,
  );
  return { id, token: encode(iv) + "." + encode(data) };
}
async function unseal(token, user, env) {
  try {
    if (typeof token !== "string" || token.length > 100000) throw Error();
    const [i, c] = token.split(".");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(i), additionalData: utf.encode(user) },
      await cipher(env),
      decode(c),
    );
    const item = JSON.parse(new TextDecoder().decode(plain));
    if (item.until < Date.now()) throw Error();
    return item;
  } catch {
    throw Error(
      "This link has expired or belongs to another account. Prepare the item again in ChatGPT.",
    );
  }
}
class HandoffError extends Error {
  constructor(message, status = 400, usePicker = false) {
    super(message);
    Object.assign(this, { status, usePicker });
  }
}
const MAX_PHOTO = 8 * 1024 * 1024;
const MAX_JSON = 96 * 1024;
async function readBounded(message, limit) {
  if (Number(message.headers.get("content-length")) > limit) {
    await message.body?.cancel().catch(() => {});
    throw new HandoffError("The upload exceeds the size limit.", 413);
  }
  const reader = message.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel().catch(() => {});
          throw new HandoffError("The upload exceeds the size limit.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return new Blob(chunks);
}
async function requestBody(request) {
  try {
    return JSON.parse(await (await readBounded(request, MAX_JSON)).text());
  } catch (error) {
    throw error instanceof HandoffError
      ? error
      : new HandoffError("Invalid request.");
  }
}
async function sellerKey(user) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    utf.encode("autolister-private-plugin:v1:" + user),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
const limits = {
  global_prepare_cap:
    "AutoLister has reached its monthly plugin draft limit. Try again next month.",
  global_read_cap:
    "AutoLister has reached its monthly plugin handoff limit. Try again next month.",
  global_photo_cap:
    "Automatic photo transfer is unavailable. Select the same photos to continue.",
  active_cap: "You have 20 recent drafts. Try again after one expires.",
  prepare_cap:
    "You have prepared 64 drafts today. Try again after midnight UTC.",
  read_cap:
    "The daily handoff request limit has been reached. Try again after midnight UTC.",
  photo_cap:
    "The daily photo transfer allowance has been reached. Choose the photos from this device to continue.",
};
// A short-lived denial cache reduces repeated database traffic on a warm worker.
// Only Postgres can grant a transfer. Never cache a success or skip settlement.
const denials = new Map();
function denialKeys(op, seller) {
  if (op === "settle") return [];
  const kind = op === "put" ? "prepare" : "read";
  const keys = ["global:" + kind, seller + ":" + kind];
  if (op === "photo") keys.push("global:photo", seller + ":photo");
  return keys;
}
function rememberDenial(code, seller) {
  if (code === "active_cap") return;
  const [scope, kind] = code.startsWith("global_")
    ? ["global", code.split("_")[1]]
    : [seller, code.split("_")[0]];
  const now = Date.now(),
    date = new Date(now);
  const reset =
    scope === "global"
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
      : Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate() + 1,
        );
  // Bytes may be refunded after an in-flight download, unlike attempt counters.
  const until = Math.min(reset, now + (kind === "photo" ? 1000 : 30000));
  if (denials.size >= 128) denials.delete(denials.keys().next().value);
  denials.set(scope + ":" + kind, { code, until });
}
function quotaError(code) {
  return new HandoffError(
    limits[code],
    429,
    ["photo_cap", "global_photo_cap"].includes(code),
  );
}
async function ledger(env, op, seller, id, payload = null, amount = null) {
  for (const key of denialKeys(op, seller)) {
    const denial = denials.get(key);
    if (denial && denial.until > Date.now()) throw quotaError(denial.code);
    if (denial) denials.delete(key);
  }
  const response = await fetch(
    env.LEDGER_ORIGIN + "/rest/v1/rpc/autolister_hosted_handoff",
    {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        apikey: env.LEDGER_ANON_KEY,
        Authorization: "Bearer " + env.LEDGER_ANON_KEY,
        "x-autolister-worker": env.LEDGER_WORKER_KEY,
      },
      body: JSON.stringify({
        op,
        seller_id: seller,
        item_id: id,
        payload,
        amount,
      }),
    },
  );
  if (!response.ok)
    throw new HandoffError(
      "The handoff service is unavailable. Try again shortly.",
      503,
    );
  const result = await response.json();
  if (result.error === "missing")
    throw new HandoffError(
      "This draft link has expired or belongs to another account.",
      404,
    );
  if (Object.hasOwn(limits, result.error)) {
    rememberDenial(result.error, seller);
    throw quotaError(result.error);
  }
  if (result.error) throw new HandoffError("Could not open this draft.", 503);
  return result;
}
async function photo(ref, budget) {
  const res = await fetch(fileURL(ref.url), {
    redirect: "manual",
    credentials: "omit",
    signal: AbortSignal.timeout(18000),
  });
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => {});
    throw new HandoffError(
      "A photo is unavailable. Choose it from this device.",
      400,
      true,
    );
  }
  let blob;
  // Vercel buffers responses and caps payloads at 4.5 MB. Fall back to the
  // local original file rather than degrading image quality or exceeding it.
  try {
    blob = await readBounded(res, Math.min(budget, 4 * 1024 * 1024));
  } catch (e) {
    if (e.status === 413)
      throw new HandoffError(
        budget < MAX_PHOTO
          ? limits.photo_cap
          : "Choose photos under 8 MiB each.",
        budget < MAX_PHOTO ? 429 : 413,
        true,
      );
    throw e;
  }
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const mime =
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes[0] === 137 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG"
        ? "image/png"
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (!mime)
    throw new HandoffError("Choose JPEG, PNG or WebP photos.", 400, true);
  return {
    size: blob.size,
    response: new Response(blob, {
      headers: { ...headers, "content-type": mime },
    }),
  };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url),
      path = url.pathname,
      user = request.headers.get("oai-authenticated-user-id");
    if (path === "/mcp" && request.method === "POST") {
      let rpc;
      try {
        rpc = await requestBody(request);
      } catch (e) {
        return json({ error: e.message }, e.status || 400);
      }
      if (!rpc || typeof rpc.method !== "string")
        return json({ error: "Invalid RPC request." }, 400);
      // Reject invalid or disproportionately large correlation IDs before reflecting them.
      const id = rpc.id;
      if (
        id != null &&
        !(typeof id === "string" && id.length <= 128) &&
        !Number.isSafeInteger(id)
      )
        return json(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Invalid request ID." },
          },
          400,
        );

      const method = rpc.method;
      const reply = (result) => json({ jsonrpc: "2.0", id: rpc.id, result });
      const error = (code, message) =>
        json({ jsonrpc: "2.0", id: rpc.id, error: { code, message } });
      if (method === "server/discover")
        return reply({
          supportedVersions: ["2026-07-28"],
          capabilities: { tools: {} },
        });
      if (method === "initialize")
        return reply({
          protocolVersion: "2025-06-18",
          serverInfo: { name: "autolister", version: "0.1.0" },
          capabilities: { tools: {} },
        });
      if (method === "ping") return reply({});
      if (method.startsWith("notifications/"))
        return new Response(null, { status: 202 });
      if (method === "tools/list") return reply({ tools: [tool] });
      const resource = {
        uri,
        name: "AutoLister draft",
        mimeType: "text/html;profile=mcp-app",
      };
      if (method === "resources/list") return reply({ resources: [] });
      if (method === "resources/read" && rpc.params?.uri === uri)
        return reply({
          contents: [
            {
              ...resource,
              text: widget,
              _meta: { ui: { prefersBorder: true } },
            },
          ],
        });
      if (method !== "tools/call" || rpc.params?.name !== tool.name)
        return error(-32601, "Unknown method or tool.");
      try {
        if (!user) throw Error("Sign in to connect AutoLister.");
        const item = check(rpc.params.arguments || {}),
          { id, token } = await seal(item, user, env);
        await ledger(env, "put", await sellerKey(user), id, token);
        const link = url.origin + "/app/chatgpt?item=" + id;
        return reply({
          content: [
            { type: "text", text: "[Open draft in AutoLister](" + link + ")" },
          ],
        });
      } catch (e) {
        return reply({
          isError: true,
          content: [{ type: "text", text: e.message }],
        });
      }
    }
    if (!user)
      return new Response("Sign in to AutoLister’s private prototype.", {
        status: 401,
        headers,
      });
    if (path === "/session") return json({ user });
    if (path === "/handoff" && request.method === "POST") {
      try {
        if (request.headers.get("origin") !== url.origin)
          return json({ error: "Origin mismatch." }, 403);
        const { index, id } = await requestBody(request);
        if (
          typeof id !== "string" ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
            id,
          )
        )
          throw new HandoffError("Invalid draft link.");
        if (
          index !== undefined &&
          (!Number.isInteger(index) || index < 0 || index >= 4)
        )
          throw new HandoffError("Invalid photo.");
        const seller = await sellerKey(user);
        try {
          const grant = await ledger(
            env,
            index === undefined ? "metadata" : "photo",
            seller,
            id,
          );
          const item = await unseal(grant.token, user, env);
          if (item.id !== id) throw new HandoffError("Invalid draft link.");
          if (index === undefined)
            return json({
              id: item.id,
              title: item.title,
              description: item.description,
              count: item.photos.length,
              transferLimited: !!grant.localOnly,
              sharedTransferLimit: !!grant.globalLocalOnly,
              reselect:
                grant.globalLocalOnly ||
                grant.localOnly ||
                item.photos.some((p) => p.reselect),
            });
          if (
            !Number.isSafeInteger(grant.budget) ||
            grant.budget <= 0 ||
            grant.budget > MAX_PHOTO ||
            !grant.reservation
          )
            throw new HandoffError("Could not reserve this transfer.", 503);
          if (!item.photos[index] || item.photos[index].reselect) {
            await ledger(env, "settle", seller, grant.reservation, null, 0);
            throw new HandoffError(
              "Choose the original photos on this page.",
              400,
              true,
            );
          }
          // Keep the full reservation on a failed, interrupted or unaccounted upstream fetch.
          const result = await photo(item.photos[index], grant.budget);
          await ledger(
            env,
            "settle",
            seller,
            grant.reservation,
            null,
            result.size,
          );
          return result.response;
        } catch (error) {
          if (
            index !== undefined &&
            !error.usePicker &&
            ![400, 401, 403, 404].includes(error.status)
          ) {
            throw new HandoffError(
              "Automatic transfer is unavailable. Choose the photos from this device.",
              error.status || 503,
              true,
            );
          }
          throw error;
        }
      } catch (e) {
        return json(
          {
            error:
              e instanceof HandoffError
                ? e.message
                : "Could not open this draft. Try again.",
            usePicker: e.usePicker === true,
          },
          e.status || 400,
        );
      }
    }
    if (request.method === "GET" && ["/", "/app", "/app/"].includes(path))
      return new Response(editor, {
        headers: {
          ...headers,
          "content-type": "text/html;charset=utf-8",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    if (request.method === "GET" && Object.hasOwn(assets, path)) {
      const [type, data] = assets[path];
      return new Response(
        Uint8Array.from(atob(data), (x) => x.charCodeAt(0)),
        { headers: { ...headers, "content-type": type } },
      );
    }
    return new Response("Not found", { status: 404, headers });
  },
};
