import { describe, expect, it } from "vitest";
import {
  itemLookupCode,
  locationLookupCode,
} from "../../../utils/ops/inventory/labels";

describe("printable lookup codes", () => {
  it("encodes opaque identifiers without a session or workspace secret", () => {
    const id = "c0000000-0000-4000-8000-000000000091";
    expect(itemLookupCode(id)).toBe(`AL-I:${id}`);
    expect(locationLookupCode(id)).toBe(`AL-L:${id}`);
  });
});
