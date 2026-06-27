import { beforeAll, describe, expect, it } from "vitest";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("events tracking attribution helpers", () => {
  beforeAll(() => {
    process.env.VERCEL_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "test-service-role-key-for-import-only";
  });

  async function loadHelpers() {
    return import("../../../api/events/track.js");
  }

  it("keeps uninstall user identity from the uninstall page payload", async () => {
    const { canAttributePublicUninstallEvent, normalizeEventItems } =
      await loadHelpers();
    const [item] = normalizeEventItems({
      event: "extension_uninstalled",
      source: "uninstall_page",
      page: "/uninstall",
      userId: USER_ID,
      context: {
        analyticsClientId: "cid-123",
        extensionVersion: "1.3.24",
      },
    });

    expect(item.userId).toBe(USER_ID);
    expect(canAttributePublicUninstallEvent(item)).toBe(true);
  });

  it("does not allow non-uninstall events to claim a public user id", async () => {
    const { canAttributePublicUninstallEvent, normalizeEventItems } =
      await loadHelpers();
    const [item] = normalizeEventItems({
      event: "chrome_store_click",
      source: "site",
      page: "/",
      userId: USER_ID,
    });

    expect(item.userId).toBe(USER_ID);
    expect(canAttributePublicUninstallEvent(item)).toBe(false);
  });

  it("rejects malformed uninstall user ids", async () => {
    const { canAttributePublicUninstallEvent, isUuid, normalizeEventItems } =
      await loadHelpers();
    const [item] = normalizeEventItems({
      event: "uninstall_feedback_submitted",
      source: "uninstall_page",
      page: "/uninstall",
      userId: "not-a-user-id",
    });

    expect(isUuid(item.userId)).toBe(false);
    expect(canAttributePublicUninstallEvent(item)).toBe(false);
  });
});
