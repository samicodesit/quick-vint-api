import type { PGlite } from "@electric-sql/pglite";
import { createServer, type Server } from "node:http";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import handler from "../../../api/generate";
import {
  createGenerationDatabase,
  owner,
  other,
} from "./fixtures/generationDatabase";

// Opt-in because the sibling extension supplies Chromium/Playwright. No live
// accounts, provider calls or marketplace requests are permitted by this test.
const enabled = process.env.RUN_GENERATION_BROWSER_TESTS === "1";
const extension =
  process.env.AUTOLISTER_EXTENSION_PATH || "/home/mests/projects/quick-vint";
const runtime = vi.hoisted(() => ({
  database: null as PGlite | null,
  providerCalls: 0,
  loseCompletionResponse: false,
}));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: async (token: string) => ({
        data: {
          user:
            token === "test-access-token" || token === "other-token"
              ? {
                  id:
                    token === "other-token"
                      ? "00000000-0000-4000-8000-000000000002"
                      : "00000000-0000-4000-8000-000000000001",
                  email: "local-test@example.com",
                }
              : null,
        },
      }),
    },
    // Adapt the PostgREST boundary to real SQL. Production claims, reservations,
    // commits, fencing and recovery helpers run unchanged against the database.
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (
        !/^[a-z_]+$/.test(name) ||
        Object.keys(args).some((key) => !/^p_[a-z_]+$/.test(key))
      )
        throw new Error("Unsafe test RPC");
      const entries = Object.entries(args);
      try {
        const result = await runtime.database!.query<{ data: unknown }>(
          `SELECT ${name}(${entries.map(([key], i) => `${key} := $${i + 1}`).join(",")}) AS data`,
          entries.map(([, value]) =>
            value && typeof value === "object" ? JSON.stringify(value) : value,
          ),
        );
        if (
          name === "complete_mobile_generation_idempotency" &&
          runtime.loseCompletionResponse
        ) {
          runtime.loseCompletionResponse = false;
          return {
            data: null,
            error: { message: "Simulated lost database response after commit" },
          };
        }
        return { data: result.rows[0].data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        single: async () => {
          if (table === "profiles")
            return {
              data: {
                subscription_tier: "pro",
                subscription_status: "active",
                last_api_call_reset: "2026-10-11",
                api_calls_this_month: 0,
                account_status: "active",
                is_legacy_plan: false,
                free_lifetime_generations_used: 0,
                pack_credits: 0,
                ai_instructions: null,
              },
              error: null,
            };
          if (table !== "generation_reservations")
            throw new Error(`Unexpected test table: ${table}`);
          const rows = await runtime.database!.query(
            `SELECT * FROM generation_reservations WHERE ${filters.map(([key], i) => `${key}=$${i + 1}`).join(" AND ")}`,
            filters.map(([, value]) => value),
          );
          return { data: rows.rows[0] || null, error: null };
        },
        maybeSingle: async () => query.single(),
      };
      return query;
    },
  },
}));
vi.mock("openai", () => ({
  OpenAI: class {
    chat = {
      completions: {
        create: () => ({
          withResponse: async () => {
            runtime.providerCalls += 1;
            await new Promise((done) => setTimeout(done, 80));
            return {
              data: {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        title: `Generated ${runtime.providerCalls}`,
                        description: "Complete locally generated result",
                      }),
                    },
                  },
                ],
                usage: {},
              },
              response: { headers: {} },
            };
          },
        }),
      },
    };
  },
}));
vi.mock("../../../utils/duplicateIpAutoPause", () => ({
  detectAndPauseDuplicateIpAccount: async () => ({ paused: false }),
}));
vi.mock("../../../utils/apiLogger", () => ({
  ApiLogger: {
    extractRequestMetadata: () => ({
      ipAddress: "127.0.0.1",
      userAgent: "local-integration",
    }),
    detectSuspiciousActivity: () => ({ suspicious: false, reasons: [] }),
    logRequest: async () => {},
  },
}));
vi.mock("../../../utils/generationOffers", async (original) => ({
  ...(await original<object>()),
  maybeCreateGenerationOffer: async () => [],
}));
vi.mock("../../../utils/criticalEndpointAlert", () => ({
  reportCriticalEndpointFailure: () => {},
}));

let server: Server;
let origin: string;
let browser: any;
let droppedResponses = 0;
let wireRequests: { requestId: string; body: unknown }[] = [];
let scratch: string;
let actualContent: string;
let chromiumExpect: any;
const files: string[] = [];

beforeAll(async () => {
  if (!enabled) return;
  if (!existsSync(join(extension, "node_modules/playwright")))
    throw new Error(
      "Install the extension's test dependencies before running the browser integration gate.",
    );
  runtime.database = await createGenerationDatabase();
  process.env.VERCEL_APP_OPENAI_API_KEY = "local-stub-only";
  process.env.VERCEL_APP_SUPABASE_URL = "https://project.supabase.co";
  process.env.DEBUG_GENERATION_IMAGES = "false";
  process.env.MOBILE_WEB_APP_ENABLED = "true";
  server = createServer(async (req, res) => {
    if (req.url?.startsWith("/api/generate")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : undefined;
      if (req.method === "POST")
        wireRequests.push({
          requestId: String(req.headers["x-autolister-request-id"]),
          body,
        });
      const response = Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return response;
        },
        json(value: unknown) {
          // Destroy the actual TCP socket only after the real handler has
          // completed its database commit, before a complete result reaches Chromium.
          if (
            req.method === "POST" &&
            res.statusCode === 200 &&
            droppedResponses > 0
          ) {
            droppedResponses -= 1;
            res.setHeader("Content-Type", "application/json");
            res.write('{"title":');
            // A partial body prevents Chromium's transparent transport retry,
            // so this also proves the extension's own retry implementation.
            setTimeout(() => res.destroy(), 10);
            return response;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(value));
          return response;
        },
      });
      try {
        await handler(Object.assign(req, { body }) as never, response as never);
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(error) }));
      }
      return;
    }
    if (req.url?.startsWith("/items/new")) {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        readFileSync(join(extension, "tests/fixtures/vinted-listing.html")),
      );
    }
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.VERCEL_APP_ALLOWED_ORIGINS = origin;
  const require = createRequire(join(extension, "package.json"));
  const { chromium } = require("playwright");
  chromiumExpect = require("@playwright/test").expect;
  browser = await chromium.launch({ headless: true });
  scratch = mkdtempSync(join(tmpdir(), "autolister-generation-integration-"));
  actualContent = readFileSync(join(extension, "content.js"), "utf8")
    .split('"https://autolister.app"')
    .join(JSON.stringify(origin));
}, 30000);
afterAll(async () => {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise<void>((done) => server.close(() => done()));
  await runtime.database?.close();
  for (const file of files) unlinkSync(file);
  if (scratch) rmdirSync(scratch);
});

async function openListing(mutateIds = false) {
  const page = await browser.newPage();
  // Hard boundary: these tests cannot contact any production API or marketplace.
  await page.route("**/*", (route: any) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );
  await page.goto(`${origin}/items/new`);
  await page.evaluate((userId: string) => {
    const listeners: any[] = [];
    const storage: Record<string, any> = {
      supabaseSession: {
        access_token: "test-access-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, email: "local-test@example.com" },
      },
      userProfile: { subscription_tier: "pro", subscription_status: "active" },
      useEmojis: false,
    };
    (window as any).chrome = {
      runtime: {
        id: "local-integration",
        getManifest: () => ({ version: "1.3.17" }),
        getURL: (asset: string) => `/assets/${asset}`,
        onMessage: { addListener() {} },
        sendMessage(message: any, callback: any) {
          const value =
            message.type === "GET_ACCESS_TOKEN"
              ? { access_token: storage.supabaseSession.access_token, userId }
              : message.type === "GET_USER_PROFILE"
                ? {
                    user: storage.supabaseSession.user,
                    profile: storage.userProfile,
                  }
                : { ok: true };
          setTimeout(() => callback?.(value), 0);
        },
      },
      storage: {
        onChanged: { addListener: (listener: any) => listeners.push(listener) },
        local: {
          get(keys: any, callback: any) {
            const result: Record<string, any> = {};
            for (const key of Array.isArray(keys)
              ? keys
              : typeof keys === "object"
                ? Object.keys(keys)
                : [keys])
              result[key] =
                storage[key] ??
                (typeof keys === "object" && !Array.isArray(keys)
                  ? keys[key]
                  : undefined);
            setTimeout(() => callback?.(result), 0);
            return Promise.resolve(result);
          },
          set(values: any, callback: any) {
            const changes: Record<string, any> = {};
            for (const [key, value] of Object.entries(values)) {
              changes[key] = { oldValue: storage[key], newValue: value };
              storage[key] = value;
            }
            listeners.forEach((listener) => listener(changes, "local"));
            setTimeout(() => callback?.(), 0);
            return Promise.resolve();
          },
          remove(keys: any) {
            for (const key of Array.isArray(keys) ? keys : [keys])
              delete storage[key];
            return Promise.resolve();
          },
        },
      },
    };
  }, owner);
  await page.addScriptTag({ path: join(extension, "language-defaults.js") });
  const content = mutateIds
    ? actualContent.replace(
        '"X-Autolister-Request-Id": generationRequest.requestId',
        '"X-Autolister-Request-Id": createGenerationRequestId()',
      )
    : actualContent;
  const file = join(scratch, `content-${files.length}.js`);
  writeFileSync(file, content);
  files.push(file);
  await page.addScriptTag({ path: file });
  await chromiumExpect(page.locator("#quickvint-gen-btn")).toBeVisible();
  return page;
}
async function committedCount() {
  return (
    await runtime.database!.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM generation_reservations WHERE status='committed'",
    )
  ).rows[0].count;
}
it.skipIf(!enabled)(
  "real socket loss after commit replays one result, while a fresh intentional click spends one new credit",
  async () => {
    const page = await openListing();
    const before = await committedCount();
    const calls = runtime.providerCalls;
    wireRequests = [];
    droppedResponses = 1;
    await page.locator("#quickvint-gen-btn").click();
    await chromiumExpect(
      page.locator('[data-testid="title--input"]'),
    ).toHaveValue(`Generated ${calls + 1}`);
    expect(wireRequests.length).toBeGreaterThanOrEqual(2);
    expect(new Set(wireRequests.map((request) => request.requestId)).size).toBe(
      1,
    );
    expect(runtime.providerCalls - calls).toBe(1);
    expect((await committedCount()) - before).toBe(1);
    await page.locator('[data-testid="title--input"]').fill("");
    await page.locator('[data-testid="description--input"]').fill("");
    await page.locator("#quickvint-gen-btn").click();
    await chromiumExpect(
      page.locator('[data-testid="title--input"]'),
    ).toHaveValue(`Generated ${calls + 2}`);
    expect(runtime.providerCalls - calls).toBe(2);
    expect((await committedCount()) - before).toBe(2);
    await page.close();
  },
  30000,
);
it.skipIf(!enabled)(
  "negative control detects duplicate AI work and credits when retry IDs are deliberately broken",
  async () => {
    const page = await openListing(true);
    const before = await committedCount();
    const calls = runtime.providerCalls;
    droppedResponses = 1;
    await page.locator("#quickvint-gen-btn").click();
    await chromiumExpect(
      page.locator('[data-testid="title--input"]'),
    ).toHaveValue(`Generated ${calls + 2}`);
    expect(runtime.providerCalls - calls).toBe(2);
    expect((await committedCount()) - before).toBe(2);
    await page.close();
  },
  30000,
);
it.skipIf(!enabled)(
  "real concurrent HTTP requests, changed inputs, account isolation and lost DB acknowledgments preserve one result per operation",
  async () => {
    const before = await committedCount();
    const calls = runtime.providerCalls;
    const requestId = randomUUID();
    const body = {
      imageUrls: ["data:image/jpeg;base64,abc"],
      titleLanguageCode: "en",
      descriptionLanguageCode: "en",
      useEmojis: false,
    };
    const send = (
      client = "extension",
      payload = body,
      token = "test-access-token",
      id: string = requestId,
    ) =>
      fetch(`${origin}/api/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Autolister-Client": client,
          "X-Autolister-Extension-Version": "1.3.17",
          "X-Autolister-Request-Id": id,
        },
        body: JSON.stringify(payload),
      });
    const concurrent = await Promise.all([send(), send()]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const replay = await send();
    expect(replay.status).toBe(200);
    expect((await replay.json()).title).toBe(`Generated ${calls + 1}`);
    expect(runtime.providerCalls - calls).toBe(1);
    expect((await committedCount()) - before).toBe(1);
    expect(
      (await send("extension", { ...body, titleLanguageCode: "fr" })).status,
    ).toBe(409);
    expect((await send("extension", body, "invalid")).status).toBe(401);
    expect(
      (await send("extension", body, "test-access-token", "bad-id")).status,
    ).toBe(400);
    expect((await send("extension", body, "other-token")).status).toBe(200);
    expect((await send("mobile_web")).status).toBe(200);
    expect((await committedCount()) - before).toBe(3);
    const scopes = (
      await runtime.database!.query(
        "SELECT DISTINCT user_id,client FROM mobile_generation_idempotency WHERE request_id=$1",
        [requestId],
      )
    ).rows;
    expect(scopes).toHaveLength(3);
    expect(scopes).toEqual(
      expect.arrayContaining([
        { user_id: owner, client: "extension" },
        { user_id: other, client: "extension" },
        { user_id: owner, client: "mobile_web" },
      ]),
    );
    runtime.loseCompletionResponse = true;
    const uncertainId = randomUUID();
    expect(
      (await send("extension", body, "test-access-token", uncertainId)).status,
    ).toBe(503);
    expect(
      (await send("extension", body, "test-access-token", uncertainId)).status,
    ).toBe(200);
    expect(runtime.providerCalls - calls).toBe(4);
    expect((await committedCount()) - before).toBe(4);
  },
  30000,
);
