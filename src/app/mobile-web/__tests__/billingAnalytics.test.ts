import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMobileJsonMock = vi.fn();
const loadUsageMock = vi.fn();
const telemetryTrack = vi.fn();
const attributionModule = {
  FIRST_TOUCH_STORAGE_KEY: "autolister.first_touch.v1",
  getStoredAttribution: vi.fn(),
  captureFirstTouch: vi.fn(),
};

vi.mock("../api.js", () => ({
  fetchMobileJson: fetchMobileJsonMock,
}));

vi.mock("../generationClient.js", () => ({
  loadUsage: loadUsageMock,
}));

vi.mock("../../../scripts/attribution.js", () => attributionModule);

describe("mobile result, billing, and analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telemetryTrack.mockResolvedValue({ queued: true });
    vi.stubGlobal("AutoListerWebsiteTelemetry", { track: telemetryTrack });
    fetchMobileJsonMock.mockResolvedValue({
      url: "https://checkout.stripe.com/c/session",
    });
    loadUsageMock.mockResolvedValue({
      canGenerate: true,
      remaining: { freeLifetime: 4 },
    });
    attributionModule.getStoredAttribution.mockReturnValue(null);
    attributionModule.captureFirstTouch.mockReturnValue(null);
    vi.stubGlobal("location", {
      origin: "https://autolister.app",
      pathname: "/app",
      search: "",
      href: "https://autolister.app/app",
    });
  });

  it("records the extension install CTA in the existing transport without private context", async () => {
    const { trackMobileEvent } = await import("../analytics.js");
    await expect(
      trackMobileEvent("chrome_store_click", {
        target: "extension_suggestion",
        email: "private@example.test",
        listingText: "Private description",
      }),
    ).resolves.toBe(true);
    expect(telemetryTrack).toHaveBeenCalledWith(
      "chrome_store_click",
      expect.objectContaining({
        source: "mobile_web",
        page: "/app",
        context: expect.objectContaining({ target: "extension_suggestion" }),
      }),
    );
    expect(JSON.stringify(telemetryTrack.mock.calls)).not.toContain(
      "private@example.test",
    );
    expect(JSON.stringify(telemetryTrack.mock.calls)).not.toContain(
      "Private description",
    );
  });

  it("copies only the requested field and preserves description line breaks", async () => {
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText: clipboardWriteText },
    });

    const { copyListingField } = await import("../billing.js");
    await copyListingField("description", "First line\n\n• Second line");

    expect(clipboardWriteText).toHaveBeenCalledWith(
      "First line\n\n• Second line",
    );
    expect(fetchMobileJsonMock).not.toHaveBeenCalled();
  });

  it("uses an execCommand fallback when the Clipboard API is unavailable", async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    const remove = vi.fn();
    const append = vi.fn();
    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      remove,
    };
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: vi.fn(() => textarea),
      body: { appendChild: append },
      execCommand,
    });

    const { copyListingField } = await import("../billing.js");
    await expect(copyListingField("title", "Blue dress")).resolves.toBe(true);

    expect(textarea.value).toBe("Blue dress");
    expect(append).toHaveBeenCalledWith(textarea);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(remove).toHaveBeenCalled();
  });

  it("starts bearer-owned checkout without client identity or return URL", async () => {
    attributionModule.getStoredAttribution.mockReturnValue({
      source: "tiktok",
      medium: "organic_social",
      campaign: "creator-name",
      content: "bio",
      capturedAt: "2026-09-23T10:00:00.000Z",
      referrerHost: "tiktok.com",
    });

    const { startMobileCheckout } = await import("../billing.js");
    await expect(startMobileCheckout("starter")).resolves.toEqual({
      url: "https://checkout.stripe.com/c/session",
    });

    expect(fetchMobileJsonMock).toHaveBeenCalledWith(
      "/api/stripe/create-checkout",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Autolister-Client": "mobile_web",
        },
      }),
      { retryOn401: true },
    );
    const body = JSON.parse(fetchMobileJsonMock.mock.calls[0][1].body);
    expect(body).toEqual({
      tier: "starter",
      source: "mobile_web",
      utm: {
        utm_source: "tiktok",
        utm_medium: "organic_social",
        utm_campaign: "creator-name",
        utm_content: "bio",
      },
    });
    expect(JSON.stringify(body)).not.toContain("email");
    expect(JSON.stringify(body)).not.toContain("returnUrl");
    expect(JSON.stringify(body)).not.toContain("customer");
    expect(JSON.stringify(body)).not.toContain("accessToken");
  });

  it("opens the bearer-owned billing portal without client identity", async () => {
    fetchMobileJsonMock.mockResolvedValueOnce({
      url: "https://billing.stripe.com/p/session",
    });
    const { openMobilePortal } = await import("../billing.js");
    await expect(openMobilePortal()).resolves.toEqual({
      url: "https://billing.stripe.com/p/session",
    });

    expect(fetchMobileJsonMock).toHaveBeenCalledWith(
      "/api/stripe/create-portal",
      expect.objectContaining({
        method: "POST",
        headers: { "X-Autolister-Client": "mobile_web" },
      }),
      { retryOn401: true },
    );
    expect(fetchMobileJsonMock.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("refreshes usage with bounded retry after checkout propagation", async () => {
    vi.useFakeTimers();
    loadUsageMock
      .mockRejectedValueOnce(new Error("webhook pending"))
      .mockResolvedValueOnce({ canGenerate: true, remaining: { monthly: 74 } });

    try {
      const { refreshAfterCheckout } = await import("../billing.js");
      const pending = refreshAfterCheckout({
        attempts: 2,
        delaysMs: [10],
      });
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toEqual({
        canGenerate: true,
        remaining: { monthly: 74 },
      });
    } finally {
      vi.useRealTimers();
    }
    expect(loadUsageMock).toHaveBeenCalledTimes(2);
  });
  it("waits for webhook propagation when usage reads succeed but still show exhausted quota", async () => {
    vi.useFakeTimers();
    loadUsageMock
      .mockResolvedValueOnce({
        canGenerate: false,
        plan: { tier: "free" },
        remaining: { generations: 0 },
      })
      .mockResolvedValueOnce({
        canGenerate: true,
        plan: { tier: "starter" },
        remaining: { generations: 75 },
      });
    try {
      const { refreshAfterCheckout } = await import("../billing.js");
      const pending = refreshAfterCheckout({ attempts: 2, delaysMs: [10] });
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toMatchObject({
        canGenerate: true,
        plan: { tier: "starter" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends only allowlisted mobile analytics context and never generated text", async () => {
    const { trackMobileEvent } = await import("../analytics.js");

    await trackMobileEvent("generation_success", {
      imageCount: 2,
      resultStatus: "ready",
      description: "private generated description",
      imageUrl: "https://signed.example/photo.jpg",
      filename: "private.jpg",
      email: "seller@example.com",
      token: "secret-token",
    });

    expect(fetchMobileJsonMock).not.toHaveBeenCalled();
    const body = telemetryTrack.mock.calls[0][1];
    expect(body).toEqual({
      source: "mobile_web",
      page: "/app",
      context: { imageCount: 2, resultStatus: "ready", source: "app_direct" },
      utm: {},
    });
    expect(JSON.stringify(body)).not.toContain("private");
    expect(JSON.stringify(body)).not.toContain("signed.example");
    expect(JSON.stringify(body)).not.toContain("seller@example.com");
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });

  it("keeps only approved checkout return statuses in analytics context", async () => {
    const { trackMobileEvent } = await import("../analytics.js");
    const getLastBody = () => telemetryTrack.mock.calls.at(-1)?.[1];

    await trackMobileEvent("checkout_return", { status: "success" });

    const successBody = getLastBody();
    expect(successBody.context).toEqual({
      status: "success",
      source: "app_direct",
    });

    await trackMobileEvent("checkout_return", { status: "unexpected" });

    const unexpectedBody = getLastBody();
    expect(unexpectedBody.context).toEqual({ source: "app_direct" });
  });

  it("claims sanitized first touch after authentication without sending a token in the body", async () => {
    attributionModule.getStoredAttribution.mockReturnValue({
      source: "google",
      medium: "search",
      campaign: "seller-search",
      content: null,
      capturedAt: "2026-09-23T10:00:00.000Z",
      referrerHost: "google.com",
    });
    const { claimFirstTouchAfterAuth } = await import("../analytics.js");
    await expect(
      claimFirstTouchAfterAuth({ access_token: "secret-access-token" } as any),
    ).resolves.toBe(true);

    expect(fetchMobileJsonMock).toHaveBeenCalledWith(
      "/api/attribution/claim",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          attribution: {
            source: "google",
            medium: "search",
            campaign: "seller-search",
            content: null,
            capturedAt: "2026-09-23T10:00:00.000Z",
            referrerHost: "google.com",
          },
        }),
      }),
      { retryOn401: true },
    );
    expect(fetchMobileJsonMock.mock.calls[0][1].body).not.toContain(
      "secret-access-token",
    );
  });

  it("renders the result contract with separate editable fields and safe actions", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/components/mobile-web/ListingResult.astro",
      "utf8",
    );
    expect(source).toContain('data-mobile-web="listing-result"');
    expect(source).toContain('data-mobile-web="result-title"');
    expect(source).toContain('data-mobile-web="result-description"');
    expect(source).toContain('data-mobile-web="copy-title"');
    expect(source).toContain('data-mobile-web="copy-description"');
    expect(source).toContain('data-mobile-web="vinted-action"');
    expect(source).not.toContain("innerHTML");
  });
});
