import { describe, it, expect } from "vitest";
import {
  claimPendingModel,
  savePendingModel,
  MODEL_PENDING_KEY,
} from "../userModelState";
function store() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
const p = {
  gender: "female",
  hair: "brown",
  heightCm: 170,
  build: "average",
  skinTone: "tone_3",
} as const;
describe("pre-auth model choice", () => {
  it("retains explicit preferences and binds them to only the first authenticated account", () => {
    const s = store();
    savePendingModel(s, p);
    expect(claimPendingModel(s, "first")?.preferences).toEqual(p);
    expect(claimPendingModel(s, "second")).toBeNull();
    expect(claimPendingModel(s, "first")?.owner).toBe("first");
  });
  it("persists skipping without substituting a default model", () => {
    const s = store();
    savePendingModel(s, null);
    expect(claimPendingModel(s, "owner")?.preferences).toBeNull();
  });
  it("rejects unavailable persistence before continuing", () => {
    expect(() =>
      savePendingModel({ getItem: () => null, setItem: () => {} }, p),
    ).toThrow();
    const s = store();
    s.setItem(MODEL_PENDING_KEY, "invalid");
    expect(claimPendingModel(s, "owner")).toBeNull();
  });
});
