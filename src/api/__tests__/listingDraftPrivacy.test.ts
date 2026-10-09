import { expect, it, vi } from "vitest";
function client(error: any = null) {
  const remove = vi.fn(async () => ({ error }));
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: async () => ({
      data: [{ id: "photo", object_key: "private/photo" }],
      error: null,
    }),
    update: () => query,
    in: () => query,
    then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
  };
  return {
    remove,
    supabase: {
      from: () => query,
      storage: { from: () => ({ remove }) },
    } as any,
  };
}
it("removes private objects before auth erasure while retaining retry tombstones", async () => {
  const { purgeListingDraftPhotos } =
    await import("../../../scripts/listing-draft-privacy.mjs");
  const { supabase, remove } = client();
  expect(await purgeListingDraftPhotos(supabase, "owner")).toBe(1);
  expect(remove).toHaveBeenCalledWith(["private/photo"]);
});
it("blocks auth erasure if private storage cannot be removed", async () => {
  const { purgeListingDraftPhotos } =
    await import("../../../scripts/listing-draft-privacy.mjs");
  const { supabase } = client({ message: "Unavailable" });
  await expect(
    purgeListingDraftPhotos(supabase, "owner"),
  ).rejects.toMatchObject({ message: "Unavailable" });
});
