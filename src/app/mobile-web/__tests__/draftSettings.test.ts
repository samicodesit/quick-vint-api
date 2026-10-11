import { expect, it } from "vitest";
import { DEFAULT_DRAFT_SETTINGS, type Draft } from "../draftContracts";
import { batchInheritingItems, settingsExtras } from "../draftSettings";
it("applies batch changes only to untouched waiting items, preserving custom and active items", () => {
  const base = {
    ...DEFAULT_DRAFT_SETTINGS,
    descriptionFooterText: "Saved note.",
    includeSellerNote: true,
  };
  const make = (
    id: string,
    settings = base,
    operation_state: Draft["operation_state"] = "idle",
    description = "",
  ) => ({ id, settings, operation_state, description }) as Draft;
  const items = [
    make("inherited"),
    make("custom", {
      ...base,
      descriptionLength: "short",
      useBulletPoints: false,
    }),
    make("active", base, "running"),
    make("ready", base, "succeeded", "Ready text"),
    make("unrelated"),
  ];
  expect(
    batchInheritingItems(
      items,
      ["inherited", "custom", "active", "ready"],
      base,
    ).map((d) => d.id),
  ).toEqual(["inherited"]);
});
it("does not report an empty or excluded note as included", () => {
  expect(
    settingsExtras({ ...DEFAULT_DRAFT_SETTINGS, includeSellerNote: true }),
  ).toContain("Note excluded");
  expect(
    settingsExtras({
      ...DEFAULT_DRAFT_SETTINGS,
      includeSellerNote: false,
      descriptionFooterText: "Kept note.",
    }),
  ).toContain("Note excluded");
});
