import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function boot(choice: string | null = null, storageBlocked = false) {
  const stored = new Map<string, string>([
    ["autolister.first_touch.v1", "campaign-fixture"],
    ["sb-auth-token", "auth-fixture"],
  ]);
  if (choice) stored.set("autolister.measurement-consent.v1", choice);
  const cookieWrites: string[] = [];
  const cookies = "_ga=old; _ga_F2QL50WB6M=old; _gcl_aw=old; session=keep";
  const document = {
    readyState: "complete",
    addEventListener: vi.fn(),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => ({
      style: {},
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      querySelector: () => ({ style: {} }),
      querySelectorAll: () => [],
    })),
    getElementById: vi.fn(() => null),
    get cookie() {
      return cookies;
    },
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  };
  const window: any = {
    location: {
      href: "https://autolister.app/success?session_id=cs_live_fixture",
      hostname: "autolister.app",
      pathname: "/success",
      search: "?session_id=cs_live_fixture",
    },
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => {
        if (storageBlocked) throw new Error("Storage blocked");
        stored.delete(key);
      },
    },
  };
  const fetch = vi.fn();
  const context = {
    window,
    document,
    fetch,
    URLSearchParams,
    URL,
    Set,
    Date,
    setTimeout: vi.fn(),
  };
  const run = () =>
    vm.runInNewContext(
      readFileSync("public/purchase-measurement.js", "utf8"),
      context,
    );
  run();
  return { window, document, fetch, stored, cookieWrites, run };
}

it.each([null, "accepted", "rejected"])(
  "disables optional tracking and consent UI for prior choice %s",
  (choice) => {
    const t = boot(choice);
    t.window.gtag("event", "page_view");
    t.window.AutoListerMeasurement.purchase({
      transaction_id: "in_fixture",
      value: 3.99,
      currency: "EUR",
      new_customer: true,
    });
    expect(t.document.createElement).not.toHaveBeenCalled();
    expect(t.document.head.appendChild).not.toHaveBeenCalled();
    expect(t.document.body.appendChild).not.toHaveBeenCalled();
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.window.dataLayer ?? []).toHaveLength(0);
    expect(t.stored.has("autolister.measurement-consent.v1")).toBe(false);
    expect(t.stored.get("autolister.first_touch.v1")).toBe("campaign-fixture");
    expect(t.stored.get("sb-auth-token")).toBe("auth-fixture");
  },
);
it("expires only legacy Google measurement cookies", () => {
  const t = boot("accepted");
  for (const name of ["_ga", "_ga_F2QL50WB6M", "_gcl_aw"])
    expect(
      t.cookieWrites.some(
        (value) => value.startsWith(name + "=") && value.includes("Max-Age=0"),
      ),
    ).toBe(true);
  expect(t.cookieWrites.some((value) => value.startsWith("session="))).toBe(
    false,
  );
});
it("remains safe with blocked storage and repeated execution", () => {
  const t = boot("accepted", true);
  expect(() => t.run()).not.toThrow();
  expect(() => t.window.AutoListerMeasurement.purchase(null)).not.toThrow();
  expect(t.fetch).not.toHaveBeenCalled();
});
