import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

class StubElement {
  id: string;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  value = "";
  checked = false;
  src = "";
  private html = "";
  private text = "";
  classList = {
    add() {},
    remove() {},
    toggle() {},
    contains() {
      return false;
    },
  };

  constructor(id: string) {
    this.id = id;
  }

  set innerHTML(value: string) {
    this.html = String(value);
  }

  get innerHTML() {
    return this.html;
  }

  set textContent(value: string) {
    this.text = String(value);
  }

  get textContent() {
    return this.text;
  }

  getContext() {
    return {
      createLinearGradient() {
        return { addColorStop() {} };
      },
    };
  }

  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}

function buildAdminHarness() {
  const html = readFileSync(join(process.cwd(), "src/pages/admin.html"), "utf8");
  const script = html
    .match(/<script>([\s\S]*)<\/script>\s*<\/body>/)?.[1]
    ?.replace("const state = {", "var state = {");

  if (!script) throw new Error("Could not extract admin script");

  const elements = new Map<string, StubElement>();
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, new StubElement(id));
    return elements.get(id)!;
  };

  const now = new Date("2026-06-22T12:00:00.000Z").toISOString();
  const usage = {
    today: {
      totalRequests: 0,
      generationRequests: 0,
      pricedGenerations: 0,
      estimatedCost: 0,
      rateLimitErrors: 0,
      avgTokensPerRequest: 0,
    },
    totalUsers: 100,
    topUsers: [],
    lastWeek: [{ date: "2026-06-22", total_api_calls: 12, estimated_cost: 0.02 }],
    openaiCostSummary: {
      windowDays: 30,
      windowStartDate: "2026-05-24",
      windowEndDate: "2026-06-22",
      pageSize: 1000,
      pagesFetched: 2,
      exactGenerationLogCount: 2000,
      analyzedGenerationLogCount: 2000,
      generationCount: 2000,
      openaiCallCount: 1891,
      noOpenAICallCount: 109,
      costedGenerations: 1891,
      unknownCostGenerations: 0,
      noOpenAIReasonBreakdown: [
        { reason: "Rate limit exceeded", count: 100 },
        { reason: "Forbidden or paused", count: 9 },
      ],
      latestNoOpenAICallLog: {
        created_at: "2026-06-22T12:00:00.000Z",
        reason: "Rate limit exceeded",
        user_email: "limited@example.com",
        response_status: 429,
      },
      totalCostUsd: 12.67,
      totalTokens: 1080000,
      avgCostPerGenerationUsd: 0.0067,
      daily: [
        { date: "2026-06-22", generation_count: 80, openai_call_count: 76, no_openai_call_count: 4, cost_usd: 0.78, tokens: 41000 },
      ],
      modelBreakdown: [
        {
          model: "gpt-5.4",
          generation_count: 1891,
          cost_usd: 12.67,
          tokens: 1080000,
          unknown_cost_count: 0,
        },
      ],
      topUsers: [
        {
          user_email: "test@example.com",
          generation_count: 100,
          cost_usd: 0.67,
          tokens: 60000,
        },
      ],
      unknownModelBreakdown: [],
      latestUnknownCostLog: null,
    },
  };

  const users = {
    users: [
      {
        id: "user-1",
        email: "test@example.com",
        email_can_contact: true,
        subscription_status: "active",
        subscription_tier: "starter",
        account_status: "active",
        created_at: now,
        last_active_at: now,
        usage: { day: 4, month: 20, day_percent: 27, month_percent: 7 },
        max_limits: { day: 15, month: 300 },
        is_at_risk: false,
      },
    ],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  };

  const logs = {
    logs: [
      {
        id: "log-1",
        created_at: now,
        endpoint: "/event/generate_cancelled",
        response_status: 200,
        user_id: "user-1",
        user_email: "test@example.com",
        ip_address: "203.0.113.24",
        full_request_body: {
          context: { reason: "description_apply_choice" },
          extensionVersion: "1.3.19",
        },
        image_urls: [],
      },
      {
        id: "log-3",
        created_at: now,
        endpoint: "/event/listing_tools_ready",
        response_status: 200,
        user_id: null,
        user_email: null,
        ip_address: "198.51.100.12",
        full_request_body: {
          context: { analyticsClientId: "cid-anon-123", visiblePhotoCount: 8 },
          extensionVersion: "1.3.24",
        },
        correlated_user: {
          id: "user-1",
          email: "test@example.com",
          lastSeenAt: now,
        },
        image_urls: [],
      },
      {
        id: "log-2",
        created_at: now,
        endpoint: "/api/generate",
        response_status: 200,
        user_id: "user-1",
        user_email: "test@example.com",
        ip_address: "203.0.113.24",
        full_request_body: {
          debugImages: {
            bucket: "temp-uploads",
            retentionHours: 6,
            images: [
              {
                index: 1,
                path: "debug-gen-test/01.jpg",
                signedUrl:
                  "https://supabase.test/storage/v1/object/sign/temp-uploads/debug-gen-test/01.jpg?token=signed",
              },
            ],
          },
          imageMetadata: [
            {
              sourceUrl: "https://example.com/item.jpg?token=private",
              bestSrcsetUrl: "https://example.com/item-large.jpg",
            },
          ],
        },
        image_urls: JSON.stringify([
          { kind: "data_url", mime: "image/jpeg", approxBytes: 1200 },
          { kind: "remote_url", url: "https://example.com/item.jpg" },
        ]),
        openai_model: "gpt-4o",
        openai_tokens_used: 1100,
        generated_title: "Blue denim jacket",
        generated_description: "A clean generated listing.",
      },
    ],
    pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
  };
  const journey = {
    profile: { id: "user-1", email: "test@example.com" },
    analyticsClientIds: ["cid-test"],
    linkedUsers: [
      {
        id: "user-1",
        email: "test@example.com",
        subscription_tier: "starter",
        subscription_status: "active",
        eventCount: 3,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ],
    summary: {
      days: 30,
      eventCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "Generated",
      tone: "warning",
      lastStage: "Edited generated output",
      steps: [],
    },
    events: [
      {
        id: "journey-1",
        created_at: now,
        endpoint: "/event/generation_output_edited",
        event: "generation_output_edited",
        stage: "Edited generated output",
        response_status: 200,
        ip_address: "203.0.113.24",
        source: "extension_content",
        page: "https://www.vinted.de/items/new",
        context: {
          titleChanged: true,
          descriptionChanged: true,
          editDelayMs: 4200,
          appliedTitle: "Grey Polka Dot Sweater -",
          currentTitle: "Grey polka dot sweater",
          appliedDescription: "This cozy grey polka dot sweater is perfect for cooler days.",
          currentDescription: "Grey polka dot sweater with a soft knit feel.",
        },
      },
    ],
  };

  const fetchCalls: string[] = [];
  const context = {
    console,
    setTimeout(fn: () => void) {
      if (typeof fn === "function") fn();
      return 1;
    },
    clearTimeout() {},
    Date,
    URLSearchParams,
    encodeURIComponent,
    localStorage: {
      getItem() {
        return Buffer.from("dev").toString("base64");
      },
      setItem() {},
      removeItem() {},
    },
    atob(value: string) {
      return Buffer.from(value, "base64").toString("binary");
    },
    btoa(value: string) {
      return Buffer.from(value, "binary").toString("base64");
    },
    history: {
      pushState(_state: unknown, _title: string, url?: string) {
        if (url) {
          const parsed = new URL(String(url), "https://admin.test");
          context.window.location.pathname = parsed.pathname;
          context.window.location.search = parsed.search;
        }
      },
      replaceState(_state: unknown, _title: string, url?: string) {
        if (url) {
          const parsed = new URL(String(url), "https://admin.test");
          context.window.location.pathname = parsed.pathname;
          context.window.location.search = parsed.search;
        }
      },
    },
    location: { reload() {} },
    window: {
      location: { hash: "", pathname: "/admin/logs", search: "" },
      innerWidth: 1200,
      addEventListener() {},
      open() {},
    },
    document: {
      body: { classList: { add() {}, remove() {} } },
      getElementById: el,
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    },
    Chart: class {
      constructor() {}
    },
    fetchCalls,
    fetch: async (endpoint: string) => {
      const url = String(endpoint);
      fetchCalls.push(url);
      let body: unknown = usage;
      if (url.includes("auth-check")) body = { ok: true };
      if (url.includes("list-users")) body = users;
      if (url.includes("view-logs")) body = logs;
      if (url.includes("log-detail")) {
        const id = new URL(url, "https://admin.test").searchParams.get("id");
        body = { log: logs.logs.find((log) => log.id === id) || logs.logs[0] };
      }
      if (url.includes("user-journey")) body = journey;
      return { ok: true, json: async () => body };
    },
  };

  const windowMock = context.window as Record<string, unknown>;
  windowMock.window = context.window;
  windowMock.document = context.document;
  windowMock.localStorage = context.localStorage;

  vm.createContext(context);
  vm.runInContext(script, context, { filename: "admin.html" });

  return {
    context: context as typeof context & {
      loadView: (view: string) => Promise<void>;
      showLogDetails: (id: string) => Promise<void>;
      showLogImagePreview: (logId: string, index: number) => void;
      showUserJourney: (userId: string, encodedEmail: string) => Promise<void>;
      showClientJourney: (analyticsClientId: string) => Promise<void>;
      openLogsForSearch: (search: string, type?: string) => void;
      openLogsForUser: (userId: string, encodedEmail?: string, type?: string) => void;
      renderUserActions: (user: Record<string, unknown>) => string;
      switchView: (view: string, options?: Record<string, unknown>) => void;
      fetchCalls: string[];
      state: {
        currentView: string;
        logsType: string;
        logsStatus: string;
        logsSearch: string;
        logsRelatedUserId: string;
        logsRelatedEmail: string;
      };
    },
    content: el("contentArea"),
    modalBody: el("modalBody"),
    modalTitle: el("modalTitle"),
  };
}

describe("admin HTML", () => {
  it("renders every admin view without runtime view errors", async () => {
    const { context, content, modalBody, modalTitle } = buildAdminHarness();

    for (const view of ["costs", "reports", "logs", "users", "emails", "ui-pages"]) {
      if (view === "logs" || view === "reports") context.state.logsType = "events";
      context.state.currentView = view;
      await context.loadView(view);
      expect(content.innerHTML, view).not.toContain("Error loading view");
      expect(content.innerHTML.length, view).toBeGreaterThan(1000);
    }

    expect(content.innerHTML).toContain('src="/welcome/en"');
    expect(content.innerHTML).toContain("Rendered welcome page preview");

    await context.showLogDetails("log-1");
    expect(modalTitle.textContent).toBe("Event Details");
    expect(modalBody.innerHTML).toContain("Context");
    expect(modalBody.innerHTML).toContain("existing-description choice");
    expect(modalBody.innerHTML).toContain("203.0.113.24");
    expect(modalBody.innerHTML).not.toContain("Input Images");
    expect(modalBody.innerHTML).not.toContain("Generated Output");

    context.state.logsType = "all";
    context.state.currentView = "logs";
    await context.loadView("logs");
    expect(content.innerHTML).toContain("activity-feed");
    expect(content.innerHTML).toContain("Blue denim jacket");
    expect(content.innerHTML).toContain("https://supabase.test/storage/v1/object/sign/temp-uploads/debug-gen-test/01.jpg?token=signed");
    expect(content.innerHTML).toContain("203.0.113.24");
    expect(content.innerHTML).toContain(">CXL<");
    expect(content.innerHTML).toContain(">API<");

    await context.showLogDetails("log-2");
    expect(modalTitle.textContent).toBe("Log Details");
    expect(modalBody.innerHTML).toContain("showLogImagePreview");
    expect(modalBody.innerHTML).toContain("https://supabase.test/storage/v1/object/sign/temp-uploads/debug-gen-test/01.jpg?token=signed");
    expect(modalBody.innerHTML).toContain("https://example.com/item.jpg");
    expect(modalBody.innerHTML).toContain("https://example.com/item-large.jpg");
    expect(modalBody.innerHTML).not.toContain("data:image");
    expect(modalBody.innerHTML).not.toContain("window.open");
    context.showLogImagePreview("log-2", 0);
    expect(context.document.getElementById("imagePreviewTitle").textContent).toBe("AI prompt image 1 of 3");
    expect(context.document.getElementById("imagePreviewImg").src).toBe(
      "https://supabase.test/storage/v1/object/sign/temp-uploads/debug-gen-test/01.jpg?token=signed",
    );

    await context.showUserJourney("user-1", encodeURIComponent("test@example.com"));
    expect(modalTitle.textContent).toBe("User Journey");
    expect(modalBody.innerHTML).toContain("Edited title + description");
    expect(modalBody.innerHTML).toContain("Grey Polka Dot Sweater -");
    expect(modalBody.innerHTML).toContain("Grey polka dot sweater");
    expect(modalBody.innerHTML).toContain("ip 203.0.113.24");
  });

  it("links anonymous analytics clients to journeys and related logs", async () => {
    const { context, content, modalBody, modalTitle } = buildAdminHarness();

    context.state.currentView = "logs";
    context.state.logsType = "events";
    await context.loadView("logs");
    expect(content.innerHTML).toContain("Logs are the forensic stream");
    expect(content.innerHTML).toContain("Cancelled");
    expect(content.innerHTML).toContain("Journey");
    expect(content.innerHTML).toContain("198.51.100.12");
    expect(content.innerHTML).not.toContain("Anonymous client cid-anon...");
    await context.showLogDetails("log-3");
    expect(modalTitle.textContent).toBe("Event Details");
    expect(modalBody.innerHTML).toContain("Client ID: cid-anon-123");
    expect(modalBody.innerHTML).toContain("198.51.100.12");
    expect(modalBody.innerHTML).toContain("Likely user: test@example.com");
    expect(modalBody.innerHTML).toContain("View correlated journey");
    expect(modalBody.innerHTML).toContain("Open related logs");

    await context.showClientJourney("cid-anon-123");
    expect(context.fetchCalls.some((url) => url.includes("analytics_client_id=cid-anon-123"))).toBe(true);
    expect(modalTitle.textContent).toBe("Correlated Journey");
    expect(modalBody.innerHTML).toContain("Likely user: test@example.com");
    expect(modalBody.innerHTML).toContain("Linked users from correlated logs");
    expect(modalBody.innerHTML).toContain("Open client event logs");

    context.openLogsForSearch("cid-anon-123", "events");
    expect(context.state.logsType).toBe("events");
    expect(context.state.logsSearch).toBe("cid-anon-123");
    expect(context.state.logsStatus).toBe("all");
    expect(context.state.logsRelatedUserId).toBe("");

    context.state.currentView = "users";
    await context.loadView("users");
    expect(content.innerHTML).toContain("Users are the account workbench");
    expect(content.innerHTML).toContain("Journey");
    expect(content.innerHTML).toContain("Logs");

    context.openLogsForUser("user-1", encodeURIComponent("test@example.com"));
    expect(context.state.logsType).toBe("all");
    expect(context.state.logsSearch).toBe("");
    expect(context.state.logsRelatedUserId).toBe("user-1");
    expect(context.state.logsRelatedEmail).toBe("test@example.com");
    expect(context.window.location.pathname).toBe("/admin/logs");
    expect(context.window.location.search).toContain("user_id=user-1");
    expect(context.window.location.search).toContain(
      "related_email=test%40example.com",
    );
    expect(context.fetchCalls.some((url) => url.includes("user_id=user-1"))).toBe(true);
  });

  it("sends log status filters to the backend", async () => {
    const { context } = buildAdminHarness();

    context.state.currentView = "logs";
    context.state.logsType = "all";
    context.state.logsStatus = "flagged";
    await context.loadView("logs");

    expect(context.fetchCalls.some((url) => url.includes("status_filter=flagged"))).toBe(true);
  });

  it("uses real admin routes for primary navigation", async () => {
    const { context } = buildAdminHarness();
    const html = readFileSync(join(process.cwd(), "src/pages/admin.html"), "utf8");

    context.state.currentView = "logs";
    await context.loadView("logs");

    expect(html).toContain('href="/admin/logs"');
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('href="/ui-components"');
    expect(html).not.toContain("localhost:");

    context.switchView("users");
    expect(context.window.location.pathname).toBe("/admin/users");
  });

  it("hides review request action after the one-time email was sent", () => {
    const { context } = buildAdminHarness();
    const baseUser = {
      id: "user-1",
      email: "test@example.com",
      email_can_contact: true,
      account_status: "active",
      is_at_risk: false,
    };

    expect(context.renderUserActions(baseUser)).toContain("Review email");
    expect(
      context.renderUserActions({
        ...baseUser,
        review_request_sent_at: "2026-07-08T00:00:00.000Z",
      }),
    ).not.toContain("Review email");
  });

  it("explains AI cost totals with the right generation denominator", async () => {
    const { context, content } = buildAdminHarness();

    context.state.currentView = "costs";
    await context.loadView("costs");

    expect(content.innerHTML).toContain("Rolling 30-day AI spend");
    expect(content.innerHTML).toContain("Estimated API cost only");
    expect(content.innerHTML).toContain("$12.67");
    expect(content.innerHTML).toContain("$0.00");
    expect(content.innerHTML).toContain("0 priced generations");
    expect(content.innerHTML).toContain("1,891 priced generations");
    expect(content.innerHTML).toContain("1,080,000 tokens");
    expect(content.innerHTML).toContain("$0.0067 avg per priced generation");
    expect(content.innerHTML).toContain("Daily spend and priced generations");
    expect(content.innerHTML).toContain("Model Split");
    expect(content.innerHTML).toContain("Highest Cost Users");
    expect(content.innerHTML).not.toContain("Stopped before OpenAI");
    expect(content.innerHTML).not.toContain("OpenAI calls");
    expect(content.innerHTML).not.toContain("Projected Monthly");
  });
});
