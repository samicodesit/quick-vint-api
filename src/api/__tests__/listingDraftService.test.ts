import { beforeEach, expect, it, vi } from "vitest";
const { rows, filters, remove, signed, from, rpc } = vi.hoisted(() => {
  const rows: any[] = [];
  const filters: any[] = [];
  const remove = vi.fn();
  const signed = vi.fn();
  const chain: any = {
    then: (resolve: any) =>
      Promise.resolve(rows.shift() || { data: [], error: null }).then(resolve),
    maybeSingle: () =>
      Promise.resolve(rows.shift() || { data: null, error: null }),
  };
  for (const method of [
    "select",
    "eq",
    "is",
    "not",
    "order",
    "limit",
    "or",
    "lt",
    "delete",
    "in",
    "update",
    "range",
  ])
    chain[method] = (...args: any[]) => {
      filters.push([method, ...args]);
      return chain;
    };
  return {
    rows,
    filters,
    remove,
    signed,
    from: vi.fn(() => chain),
    rpc: vi.fn(),
  };
});
vi.mock("../../../utils/supabaseClient", () => ({
  supabase: {
    from,
    rpc,
    storage: { from: () => ({ remove, createSignedUrls: signed }) },
  },
}));
import {
  cleanupDraftPhotos,
  handleDraftAction,
  loadDraft,
} from "../../../utils/listingDrafts";
const id = "123e4567-e89b-42d3-a456-426614174000";
beforeEach(() => {
  rows.length = 0;
  filters.length = 0;
  vi.clearAllMocks();
  remove.mockResolvedValue({ error: null });
  signed.mockResolvedValue({ data: [], error: null });
  rpc.mockResolvedValue({ data: null, error: null });
});
it("preserves timestamp precision when paging drafts", async () => {
  const created = "2026-10-09T12:34:56.123456+00:00";
  await handleDraftAction(id, "list", {
    cursor: Buffer.from(JSON.stringify({ created, id })).toString("base64url"),
  });
  expect(filters.find((f) => f[0] === "or")?.[1]).toContain(created);
});
it("never returns owner keys, storage paths, reservation IDs or pending output", async () => {
  rows.push(
    {
      data: {
        id,
        user_id: id,
        object_key: "private",
        reservation_id: id,
        pending_result: { title: "Private" },
        title: "Public title",
        description: "Public description",
        settings: {},
        state: "draft",
        version: 1,
        input_version: 1,
        operation_id: null,
        operation_state: "idle",
        updated_at: "now",
      },
      error: null,
    },
    { data: [], error: null },
  );
  const draft = await loadDraft(id, id);
  expect(draft).not.toHaveProperty("reservation_id");
  expect(draft).not.toHaveProperty("pending_result");
  expect(draft).not.toHaveProperty("user_id");
  expect(filters).toContainEqual(["eq", "user_id", id]);
});
it("cleans orphaned and removed photos even when rollout flags are disabled", async () => {
  process.env.LISTING_DRAFTS_ENABLED = "false";
  rows.push(
    {
      data: [{ id, object_key: "private", grant_expires_at: "2026-01-01" }],
      error: null,
    },
    { data: [], error: null },
  );
  expect(await cleanupDraftPhotos()).toBe(1);
  expect(remove).toHaveBeenCalledWith(["private"]);
  expect(filters.find((f) => f[0] === "or")?.[1]).toContain("user_id.is.null");
});
it("keeps cleanup tombstones when storage removal fails", async () => {
  rows.push({ data: [{ id, object_key: "private" }], error: null });
  remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
  await expect(cleanupDraftPhotos()).rejects.toThrow();
  expect(filters.some((f) => f[0] === "delete")).toBe(false);
});
it("fences expired owned uploads and defers storage deletion through the grace period", async () => {
  rows.push({
    data: [
      {
        id,
        user_id: id,
        object_key: "private",
        status: "pending",
        deleted_at: null,
      },
    ],
    error: null,
  });
  expect(await cleanupDraftPhotos()).toBe(0);
  expect(rpc).toHaveBeenCalledWith(
    "listing_draft_mutate",
    expect.objectContaining({
      p_user_id: id,
      p_action: "expireUpload",
      p_input: expect.objectContaining({ photoId: id }),
    }),
  );
  expect(remove).not.toHaveBeenCalled();
  expect(filters.some((f) => f[0] === "delete")).toBe(false);
});
it("acknowledges a committed deletion when Storage cleanup must retry later", async () => {
  rpc.mockResolvedValue({ data: { id }, error: null });
  rows.push({ data: [{ object_key: "private" }], error: null });
  remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await expect(
      handleDraftAction(id, "delete", { draftId: id, expectedVersion: 1 }),
    ).resolves.toEqual({ deleted: true });
    expect(warning).toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});
