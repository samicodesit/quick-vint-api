import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => m.read(table) }) }),
    }),
  },
}));
import { photoAccess } from "../../../utils/listingPhotoJobs";
beforeEach(() => vi.clearAllMocks());
it("overlaps independent access reads while still waiting for both guards", async () => {
  const releases = new Map<string, (value: unknown) => void>();
  m.read.mockImplementation(
    (table: string) => new Promise((resolve) => releases.set(table, resolve)),
  );
  const pending = photoAccess("owner");
  await Promise.resolve();
  expect([...releases.keys()].sort()).toEqual(["profiles", "system_settings"]);
  releases.get("profiles")!({
    data: { id: "owner", subscription_status: "active" },
  });
  releases.get("system_settings")!({ data: { value: "true" } });
  expect(await pending).toBe(false);
});
it("fails closed on either failed lookup or a paused account", async () => {
  for (const failed of ["profiles", "system_settings"]) {
    m.read.mockImplementation(async (table: string) =>
      table === failed
        ? { error: new Error("unavailable") }
        : {
            data: {
              id: "owner",
              value: "false",
              subscription_status: "active",
            },
          },
    );
    expect(await photoAccess("owner")).toBe(false);
  }
  m.read.mockResolvedValue({
    data: {
      id: "owner",
      value: "false",
      account_status: "paused",
      subscription_status: "active",
    },
  });
  expect(await photoAccess("owner")).toBe(false);
});
