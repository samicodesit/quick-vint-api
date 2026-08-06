import { describe, expect, it } from "vitest";
import {
  readInstallPlanIntent,
  saveInstallPlanIntent,
} from "../installPlanIntent.js";

function storage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set("autolister_pending_install_plan", initial);
  return {
    getItem(key: string) {
      return values.get(key) || null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

describe("install plan intent", () => {
  it("keeps only fresh paid plan choices", () => {
    const store = storage();
    saveInstallPlanIntent(store, "business", {
      now: 1_000,
      utm: {
        ignored: "value",
        utm_campaign: "business",
        utm_source: "google",
      },
    });

    expect(readInstallPlanIntent(store, 2_000)).toEqual({
      createdAt: 1_000,
      plan: "business",
      utm: {
        utm_campaign: "business",
        utm_source: "google",
      },
    });

    saveInstallPlanIntent(store, "free", { now: 3_000 });
    expect(readInstallPlanIntent(store, 3_000)).toBeNull();
  });

  it("clears malformed, future, and expired values", () => {
    const malformed = storage("not-json");
    expect(readInstallPlanIntent(malformed, 2_000)).toBeNull();
    expect(malformed.values.size).toBe(0);

    const future = storage(JSON.stringify({ plan: "pro", createdAt: 3_000 }));
    expect(readInstallPlanIntent(future, 2_000)).toBeNull();
    expect(future.values.size).toBe(0);

    const expired = storage(
      JSON.stringify({ plan: "starter", createdAt: 1_000 }),
    );
    expect(readInstallPlanIntent(expired, 3_602_001)).toBeNull();
    expect(expired.values.size).toBe(0);
  });

  it("falls back safely when browser storage is unavailable", () => {
    const unavailable = {
      getItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(() => saveInstallPlanIntent(unavailable, "business")).not.toThrow();
    expect(readInstallPlanIntent(unavailable)).toBeNull();
  });
});
