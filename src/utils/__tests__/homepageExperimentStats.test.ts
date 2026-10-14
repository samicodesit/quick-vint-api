import { describe, expect, it, vi } from "vitest";
vi.mock("../../../utils/supabaseClient", () => ({ supabase: {} }));
import { buildHomepageExperimentStats } from "../../../utils/homepageExperimentStats";
const id = "mobile-entry-v1";
const now = Date.parse("2026-10-21T12:00:00Z");
const exposure = (
  client: string,
  variant = "a",
  time = "2026-10-12T12:00:00Z",
) => ({
  id: `ex-${client}`,
  endpoint: "/event/home_hero_exposure",
  created_at: time,
  response_status: 204,
  full_request_body: {
    source: "website",
    event: "home_hero_exposure",
    occurredAt: time,
    context: {
      analyticsClientId: client,
      heroExperiment: id,
      heroVariant: variant,
    },
  },
});
const event = (
  client: string,
  name: string,
  time = "2026-10-13T12:00:00Z",
) => ({
  id: `${name}-${client}`,
  user_id: "seller",
  endpoint: `/event/${name}`,
  created_at: time,
  response_status: 204,
  full_request_body: {
    source: name === "copy" ? "mobile_web" : "website",
    event: name,
    context: {
      analyticsClientId: client,
      heroExperiment: id,
      heroVariant: "b",
    },
  },
});
const generation = (
  client: string,
  requestId = "r1",
  time = "2026-10-13T12:00:00Z",
) => ({
  id: `gen-${client}-${requestId}`,
  user_id: "seller",
  endpoint: "/api/generate",
  created_at: time,
  response_status: 200,
  full_request_body: {
    client: "mobile_web",
    analyticsClientId: client,
    requestId,
  },
});
const arm = (logs: any[], variant = "a", profiles: any[] = []) =>
  buildHomepageExperimentStats(logs, profiles, now).arms.find(
    (a) => a.variant === variant,
  )!;
describe("homepage seven-day experiment cohorts", () => {
  it("retains verified account attribution from a restored session without inventing a generation", () => {
    const restored = event("c1", "session_restored");
    restored.full_request_body.source = "mobile_web";
    const paid = {
      id: "paid",
      endpoint: "/event/subscription_started",
      user_id: "seller",
      response_status: 204,
      created_at: "2026-10-14T12:00:00Z",
      full_request_body: {
        source: "stripe_webhook",
        context: { status: "active", tier: "starter" },
      },
    };
    expect(arm([exposure("c1"), restored, paid])).toMatchObject({
      paid: 1,
      generated: 0,
    });
  });
  it("requires a real authenticated API outcome, deduplicates browser exposure and transport retries", () => {
    const ex = exposure("c1");
    const g = generation("c1");
    expect(
      arm([ex, ex, event("c1", "generation_success"), { ...g, user_id: null }]),
    ).toMatchObject({
      exposed: 1,
      generated: 0,
      mature: 1,
      matureGenerated: 0,
    });
    expect(
      arm([
        ex,
        g,
        g,
        generation("c1", "r2"),
        event("c1", "copy"),
        event("c1", "copy"),
      ]),
    ).toMatchObject({
      exposed: 1,
      generated: 1,
      copied: 1,
      matureGenerated: 1,
      conversionRate: 100,
    });
  });
  it("does not assign a shared account's other browser or extension generation to the exposed browser", () => {
    expect(
      arm([
        exposure("c1"),
        generation("c2"),
        {
          ...generation("c1"),
          full_request_body: { client: "extension", analyticsClientId: "c1" },
        },
      ]),
    ).toMatchObject({ generated: 0 });
  });
  it("uses first observed exposure, not later claimed variants; counts app and extension intent separately", () => {
    const logs = [
      exposure("c1"),
      exposure("c1", "b", "2026-10-13T12:00:00Z"),
      event("c1", "web_app_click"),
      event("c1", "chrome_store_click"),
    ];
    expect(arm(logs)).toMatchObject({
      exposed: 1,
      appClicks: 1,
      extensionClicks: 1,
    });
    expect(arm(logs, "b").exposed).toBe(0);
  });
  it("counts recovered committed operations once even if the recovery log has no browser ID", () => {
    const first = {
      ...generation("c1"),
      response_status: 503,
      full_request_body: {
        ...generation("c1").full_request_body,
        generationCommitted: true,
        generationStartedAt: "2026-10-13T12:00:00Z",
      },
    };
    const recovery = {
      ...generation("c1"),
      endpoint: "/api/generation-result",
      full_request_body: {
        client: "mobile_web",
        requestId: "r1",
        generationCommitted: true,
      },
    };
    expect(arm([exposure("c1"), recovery, first])).toMatchObject({
      generated: 1,
    });
  });
  it("excludes internal users and their anonymous exposures through both API and event IDs", () => {
    const profiles = [{ id: "seller", email: "samicodesit@gmail.com" }];
    expect(arm([exposure("c1"), generation("c1")], "a", profiles).exposed).toBe(
      0,
    );
  });
  it("excludes outcomes before exposure or outside seven days and keeps immature cohorts out of the rate", () => {
    const recent = exposure("recent", "a", "2026-10-20T12:00:00Z");
    expect(
      arm([
        exposure("c1"),
        generation("c1", "early", "2026-10-12T11:00:00Z"),
        generation("c1", "late", "2026-10-19T12:00:01Z"),
        recent,
        generation("recent", "r3", "2026-10-21T10:00:00Z"),
      ]),
    ).toMatchObject({
      exposed: 2,
      generated: 1,
      mature: 1,
      matureGenerated: 0,
      conversionRate: 0,
    });
    expect(arm([recent]).conversionRate).toBeNull();
  });
  it("ignores malformed, future and out-of-enrollment exposures and future outcomes", () => {
    const logs = [
      exposure("old", "a", "2026-10-11T12:00:00Z"),
      exposure("future", "a", "2026-10-23T12:00:00Z"),
      exposure("bad", "c"),
      exposure("c1"),
      generation("c1", "future", "2026-10-22T12:00:00Z"),
    ];
    expect(arm(logs)).toMatchObject({ exposed: 1, generated: 0 });
  });
  it("reports confidence bounds and no automatic winner", () => {
    const bot = exposure("crawler");
    expect(
      arm([
        {
          ...bot,
          full_request_body: {
            ...bot.full_request_body,
            automatedTraffic: true,
          },
        },
      ]).exposed,
    ).toBe(0);
    const result = buildHomepageExperimentStats(
      [exposure("c1"), generation("c1")],
      [],
      now,
    );
    expect(result.arms[0].confidenceInterval![0]).toBeCloseTo(20.65, 1);
    expect(result.arms[0].confidenceInterval![1]).toBeCloseTo(100, 1);
    expect(result).not.toHaveProperty("winner");
  });
  it("attributes real Stripe activations only with one eligible authenticated browser, never a checkout return", () => {
    const payment = {
      id: "paid",
      endpoint: "/event/subscription_started",
      user_id: "seller",
      response_status: 204,
      created_at: "2026-10-14T12:00:00Z",
      full_request_body: {
        source: "stripe_webhook",
        context: { status: "active", tier: "starter" },
      },
    };
    expect(arm([exposure("c1"), event("c1", "checkout_return")]).paid).toBe(0);
    expect(arm([exposure("c1"), generation("c1"), payment, payment]).paid).toBe(
      1,
    );
    expect(
      arm([
        exposure("c1"),
        exposure("c2", "b"),
        generation("c1"),
        generation("c2"),
        payment,
      ]).paid,
    ).toBe(0);
  });
});
