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
    today: { totalRequests: 12, estimatedCost: 0.02, rateLimitErrors: 0, avgTokensPerRequest: 900 },
    totalUsers: 100,
    topUsers: [],
    lastWeek: [{ date: "2026-06-22", total_api_calls: 12, estimated_cost: 0.02 }],
  };

  const growth = {
    days: 30,
    generatedAt: now,
    rates: {
      activationPerSignup30d: 55,
      twoPlusGeneration30d: 40,
      signupToPaid30d: 5,
      limitToPaywall30d: 75,
      paywallToCheckout30d: 12,
      quotaPressure30d: 28,
    },
    totals: { activeGenerators: 30, quotaPressureUsers: 8, twoPlusGenerationUsers: 12 },
    last30: {
      signups: 70,
      activeGenerators: 30,
      successfulGenerations: 140,
      limitHits: 15,
      paywallShown: 10,
      checkoutStart: 3,
      checkoutOpened: 2,
      paidSignups: 2,
      magicLinkRequests: 6,
    },
    daily: [
      {
        date: "2026-06-22",
        signups: 4,
        activeGenerators: 2,
        successfulGenerations: 8,
        limitHits: 1,
        paywallShown: 1,
        checkoutStart: 0,
        checkoutOpened: 0,
      },
    ],
    topEvents: [
      { event: "uninstall_feedback_submitted", count: 2 },
      { event: "generate_error", count: 1 },
      { event: "checkout_start", count: 3 },
    ],
    eventSummary: {
      categories: [
        { category: "Acquisition Quality", count: 2 },
        { category: "Product Usage", count: 9 },
        { category: "Revenue Intent", count: 3 },
        { category: "Auth", count: 1 },
      ],
      uninstallReasons: [{ reason: "results_not_good_enough", label: "Results were not good enough", count: 2 }],
      recentImportantEvents: [
        {
          event: "uninstall_feedback_submitted",
          category: "Acquisition Quality",
          createdAt: now,
          extensionVersion: "1.3.19",
          userId: null,
          context: { reasonLabel: "Results were not good enough" },
        },
      ],
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
        full_request_body: {},
        image_urls: JSON.stringify(["https://example.com/item.jpg"]),
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
    history: { pushState() {} },
    location: { reload() {} },
    window: {
      location: { hash: "" },
      innerWidth: 1200,
      addEventListener() {},
      open() {},
      growthChart: null,
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
      if (url.includes("growth-stats")) body = growth;
      if (url.includes("list-users")) body = users;
      if (url.includes("view-logs")) body = logs;
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
      showLogDetails: (id: string) => void;
      showUserJourney: (userId: string, encodedEmail: string) => Promise<void>;
      showClientJourney: (analyticsClientId: string) => Promise<void>;
      openLogsForSearch: (search: string, type?: string) => void;
      fetchCalls: string[];
      state: { currentView: string; logsType: string; logsStatus: string; logsSearch: string };
    },
    content: el("contentArea"),
    modalBody: el("modalBody"),
    modalTitle: el("modalTitle"),
  };
}

describe("admin HTML", () => {
  it("renders every admin view without runtime view errors", async () => {
    const { context, content, modalBody, modalTitle } = buildAdminHarness();

    for (const view of ["overview", "growth", "events", "logs", "users", "ui-pages"]) {
      if (view === "logs") context.state.logsType = "events";
      context.state.currentView = view;
      await context.loadView(view);
      expect(content.innerHTML, view).not.toContain("Error loading view");
      expect(content.innerHTML.length, view).toBeGreaterThan(1000);
    }

    expect(content.innerHTML).toContain('src="/welcome/en"');
    expect(content.innerHTML).toContain("Rendered welcome page preview");

    context.showLogDetails("log-1");
    expect(modalTitle.textContent).toBe("Event Details");
    expect(modalBody.innerHTML).toContain("Context");
    expect(modalBody.innerHTML).toContain("existing-description choice");
    expect(modalBody.innerHTML).not.toContain("Input Images");
    expect(modalBody.innerHTML).not.toContain("Generated Output");

    context.state.logsType = "all";
    context.state.currentView = "logs";
    await context.loadView("logs");
    expect(content.innerHTML).toContain("activity-feed");
    expect(content.innerHTML).toContain("Blue denim jacket");
    expect(content.innerHTML).toContain("https://example.com/item.jpg");
    expect(content.innerHTML).toContain(">CXL<");
    expect(content.innerHTML).toContain(">API<");

    await context.showUserJourney("user-1", encodeURIComponent("test@example.com"));
    expect(modalTitle.textContent).toBe("User Journey");
    expect(modalBody.innerHTML).toContain("Edited title + description");
    expect(modalBody.innerHTML).toContain("Grey Polka Dot Sweater -");
    expect(modalBody.innerHTML).toContain("Grey polka dot sweater");
  });

  it("links anonymous analytics clients to journeys and related logs", async () => {
    const { context, content, modalBody, modalTitle } = buildAdminHarness();

    context.state.currentView = "events";
    await context.loadView("events");
    expect(content.innerHTML).toContain("Signals are product behavior");
    expect(content.innerHTML).toContain("Signal Map");
    expect(content.innerHTML).toContain("All event logs");
    expect(content.innerHTML).not.toContain("Latest Raw Events");

    context.state.currentView = "logs";
    context.state.logsType = "events";
    await context.loadView("logs");
    expect(content.innerHTML).toContain("Logs are the forensic stream");
    expect(content.innerHTML).toContain("Cancelled");
    expect(content.innerHTML).toContain("Likely user: test@example.com");
    expect(content.innerHTML).not.toContain("Anonymous client cid-anon...");
    context.showLogDetails("log-3");
    expect(modalTitle.textContent).toBe("Event Details");
    expect(modalBody.innerHTML).toContain("Client ID: cid-anon-123");
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

    context.state.currentView = "users";
    await context.loadView("users");
    expect(content.innerHTML).toContain("Users are the account workbench");
    expect(content.innerHTML).toContain("Journey");
    expect(content.innerHTML).toContain("Logs");
  });

  it("sends log status filters to the backend", async () => {
    const { context } = buildAdminHarness();

    context.state.currentView = "logs";
    context.state.logsType = "all";
    context.state.logsStatus = "flagged";
    await context.loadView("logs");

    expect(context.fetchCalls.some((url) => url.includes("status_filter=flagged"))).toBe(true);
  });
});
