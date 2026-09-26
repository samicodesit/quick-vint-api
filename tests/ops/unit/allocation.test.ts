import { describe, expect, it } from "vitest";
import { allocateMinor } from "../../../utils/ops/inventory/lots";

describe("T03 lot cost allocation", () => {
  const ids = ["c0000000-0000-4000-8000-000000000003", "c0000000-0000-4000-8000-000000000001", "c0000000-0000-4000-8000-000000000002"];

  it("splits EUR 10.00 exactly by stable item ID", () => {
    expect(allocateMinor(1000, ids, {})).toEqual({
      "c0000000-0000-4000-8000-000000000001": 334,
      "c0000000-0000-4000-8000-000000000002": 333,
      "c0000000-0000-4000-8000-000000000003": 333,
    });
  });

  it("keeps missing cost different from explicit zero", () => {
    expect(allocateMinor(null, ids, {})).toEqual(Object.fromEntries(ids.map((id) => [id, null])));
    expect(allocateMinor(0, ids, {})).toEqual(Object.fromEntries(ids.map((id) => [id, 0])));
  });

  it("redistributes overrides and rejects over-allocation", () => {
    expect(allocateMinor(1000, ids, { [ids[0]]: 400 })).toEqual({
      "c0000000-0000-4000-8000-000000000001": 300,
      "c0000000-0000-4000-8000-000000000002": 300,
      "c0000000-0000-4000-8000-000000000003": 400,
    });
    expect(() => allocateMinor(1000, ids, { [ids[0]]: 1001 })).toThrow(/exceed/i);
  });
});
