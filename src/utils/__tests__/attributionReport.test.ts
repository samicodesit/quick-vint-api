import { describe, expect, it } from "vitest";
import {
  buildAttributionReport,
  isNewAcquisition,
} from "../../../utils/attribution";

describe("attribution report", () => {
  it("counts only a recently claimed new profile as a new signup", () => {
    expect(
      isNewAcquisition({
        profileCreatedAt: "2026-09-22T09:00:00.000Z",
        claimedAt: "2026-09-22T09:05:00.000Z",
      }),
    ).toBe(true);
    expect(
      isNewAcquisition({
        profileCreatedAt: "2026-09-01T09:00:00.000Z",
        claimedAt: "2026-09-22T09:05:00.000Z",
      }),
    ).toBe(false);
  });

  it("separates TikTok signups, activation, and paid outcomes", () => {
    const report = buildAttributionReport(
      [
        {
          userId: "new-user",
          source: "tiktok",
          medium: "organic_social",
          campaign: "profile",
          capturedAt: "2026-09-22T08:55:00.000Z",
          claimedAt: "2026-09-22T09:05:00.000Z",
        },
        {
          userId: "existing-user",
          source: "tiktok",
          medium: "organic_social",
          campaign: "profile",
          capturedAt: "2026-09-22T08:55:00.000Z",
          claimedAt: "2026-09-22T09:05:00.000Z",
        },
      ],
      [
        {
          id: "new-user",
          created_at: "2026-09-22T09:00:00.000Z",
          subscription_status: "active",
          subscription_tier: "starter",
        },
        {
          id: "existing-user",
          created_at: "2026-09-01T09:00:00.000Z",
          subscription_status: "free",
          subscription_tier: "free",
        },
      ],
      [
        {
          user_id: "new-user",
          endpoint: "/api/generate",
          response_status: 200,
          created_at: "2026-09-22T09:10:00.000Z",
        },
        {
          user_id: "existing-user",
          endpoint: "/api/generate",
          response_status: 500,
          created_at: "2026-09-22T09:10:00.000Z",
        },
      ],
      { now: "2026-09-22T12:00:00.000Z", days: 30 },
    );

    expect(report.cohorts).toEqual([
      expect.objectContaining({
        source: "tiktok",
        campaign: "profile",
        captured: 2,
        newSignups: 1,
        activated: 1,
        paid: 1,
      }),
    ]);
    expect(report.totals).toMatchObject({
      captured: 2,
      newSignups: 1,
      activated: 1,
      paid: 1,
    });
  });

  it("leaves unobserved profiles out of attributed cohorts", () => {
    const report = buildAttributionReport(
      [],
      [
        {
          id: "unknown-user",
          created_at: "2026-09-22T09:00:00.000Z",
          subscription_status: "active",
          subscription_tier: "starter",
        },
      ],
      [],
      { now: "2026-09-22T12:00:00.000Z", days: 30 },
    );

    expect(report.cohorts).toEqual([]);
    expect(report.unknownProfiles).toBe(1);
    expect(report.unobservableCrossDevice).toBe(true);
  });
});
