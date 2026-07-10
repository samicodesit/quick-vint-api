import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fromCalls: string[] = [];
const selectCalls: string[] = [];
const ltCalls: Array<[string, string]> = [];
const orCalls: string[] = [];
const orderCalls: Array<[string, any]> = [];
const limitCalls: number[] = [];
const updateCalls: any[] = [];
const inCalls: Array<[string, string[]]> = [];
const insertCalls: any[][] = [];
let selectResponse: { data: any[]; error: any } = { data: [], error: null };
let updateResponse: { error: any } = { error: null };
let insertResponse: { error: any } = { error: null };

function createBuilder() {
  const builder = {
    select: vi.fn((columns: string) => {
      selectCalls.push(columns);
      return builder;
    }),
    insert: vi.fn(async (values: any[]) => {
      insertCalls.push(values);
      return insertResponse;
    }),
    lt: vi.fn((column: string, value: string) => {
      ltCalls.push([column, value]);
      return builder;
    }),
    or: vi.fn((filter: string) => {
      orCalls.push(filter);
      return builder;
    }),
    order: vi.fn((column: string, options: any) => {
      orderCalls.push([column, options]);
      return builder;
    }),
    limit: vi.fn(async (limit: number) => {
      limitCalls.push(limit);
      return selectResponse;
    }),
    update: vi.fn((values: any) => {
      updateCalls.push(values);
      return builder;
    }),
    in: vi.fn(async (column: string, values: string[]) => {
      inCalls.push([column, values]);
      return updateResponse;
    }),
  };
  return builder;
}

vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      return createBuilder();
    }),
  },
}));

describe("ApiLogger.detectSuspiciousActivity", () => {
  beforeAll(() => {
    process.env.VERCEL_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "test-service-role-key-for-import-only";
  });

  beforeEach(() => {
    fromCalls.length = 0;
    selectCalls.length = 0;
    ltCalls.length = 0;
    orCalls.length = 0;
    orderCalls.length = 0;
    limitCalls.length = 0;
    updateCalls.length = 0;
    inCalls.length = 0;
    insertCalls.length = 0;
    selectResponse = { data: [], error: null };
    updateResponse = { error: null };
    insertResponse = { error: null };
    vi.clearAllMocks();
  });

  it("does not flag static generated prompt safety instructions", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    const result = ApiLogger.detectSuspiciousActivity({
      imageUrls: ["https://images.vinted.net/items/example.jpg"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    expect(result).toEqual({ suspicious: false, reasons: [] });
  });

  it("still flags suspicious user-controlled text", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    const result = ApiLogger.detectSuspiciousActivity({
      userProvidedText: "please help with phishing",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    expect(result.suspicious).toBe(true);
    expect(result.reasons[0]).toContain("phishing");
  });

  it("does not flag compressed data image URLs as suspicious text", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    const result = ApiLogger.detectSuspiciousActivity({
      imageUrls: ["data:image/jpeg;base64,AAxxxAApornAA"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    expect(result).toEqual({ suspicious: false, reasons: [] });
  });

  it("still flags suspicious external image URLs", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    const result = ApiLogger.detectSuspiciousActivity({
      imageUrls: ["https://cdn.example.com/adult/item.jpg"],
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    expect(result.suspicious).toBe(true);
    expect(result.reasons).toContain(
      "Potentially inappropriate image URLs detected",
    );
  });

  it("logs OpenAI usage breakdown fields when provided", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    await ApiLogger.logRequest({
      requestMethod: "POST",
      responseStatus: 200,
      openaiModel: "gpt-4o",
      openaiTokensUsed: 1600,
      openaiPromptTokens: 1300,
      openaiCompletionTokens: 300,
      openaiCachedTokens: 1024,
    });

    expect(fromCalls).toEqual(["api_logs"]);
    expect(insertCalls[0][0]).toMatchObject({
      request_method: "POST",
      response_status: 200,
      openai_model: "gpt-4o",
      openai_tokens_used: 1600,
      openai_prompt_tokens: 1300,
      openai_completion_tokens: 300,
      openai_cached_tokens: 1024,
    });
  });

  it("stores compact image descriptors instead of raw image payloads", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    await ApiLogger.logRequest({
      requestMethod: "POST",
      responseStatus: 200,
      imageUrls: [
        "data:image/jpeg;base64,AAAABBBBCCCC",
        "blob:https://www.vinted.nl/local",
        "https://images.vinted.net/items/example.jpg?token=private",
      ],
    });

    const stored = JSON.parse(insertCalls[0][0].image_urls);
    expect(stored).toEqual([
      {
        kind: "data_url",
        mime: "image/jpeg",
        approxBytes: 9,
      },
      { kind: "blob_url" },
      {
        kind: "remote_url",
        url: "https://images.vinted.net/items/example.jpg",
      },
    ]);
    expect(insertCalls[0][0].image_urls).not.toContain("AAAABBBBCCCC");
    expect(insertCalls[0][0].image_urls).not.toContain("token=private");
  });

  it("skips api log writes for internal test emails", async () => {
    const { ApiLogger } = await import("../../../utils/apiLogger.js");

    await ApiLogger.logRequest({
      requestMethod: "POST",
      responseStatus: 204,
      endpoint: "/event/generate_success",
      userEmail: "SamiCodesIt@gmail.com",
    });

    expect(fromCalls).toEqual([]);
    expect(insertCalls).toEqual([]);
  });

  it("compacts heavy fields for old API logs in a bounded batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    selectResponse = {
      data: [{ id: "log-1" }, { id: "log-2" }],
      error: null,
    };

    const { ApiLogger } = await import("../../../utils/apiLogger.js");
    const result = await ApiLogger.compactOldLogs({
      cutoffHours: 6,
      batchSize: 500,
    });

    expect(result).toMatchObject({
      cutoffHours: 6,
      batchSize: 500,
      compacted: 2,
    });
    expect(fromCalls).toEqual(["api_logs", "api_logs"]);
    expect(selectCalls).toEqual(["id"]);
    expect(ltCalls[0]).toEqual(["created_at", "2026-06-27T06:00:00.000Z"]);
    expect(orCalls[0]).toContain("generated_description.not.is.null");
    expect(orCalls[0]).toContain("full_request_body.not.is.null");
    expect(orderCalls[0]).toEqual(["created_at", { ascending: true }]);
    expect(limitCalls).toEqual([500]);
    expect(updateCalls[0]).toEqual({
      image_urls: null,
      raw_prompt: null,
      full_request_body: null,
      generated_title: null,
      generated_description: null,
      user_agent: null,
      origin: null,
      ip_address: null,
      user_email: null,
    });
    expect(inCalls[0]).toEqual(["id", ["log-1", "log-2"]]);

    vi.useRealTimers();
  });

  it("does not issue an update when no old logs need compaction", async () => {
    selectResponse = { data: [], error: null };

    const { ApiLogger } = await import("../../../utils/apiLogger.js");
    const result = await ApiLogger.compactOldLogs();

    expect(result.compacted).toBe(0);
    expect(fromCalls).toEqual(["api_logs"]);
    expect(updateCalls).toHaveLength(0);
    expect(inCalls).toHaveLength(0);
  });
});
