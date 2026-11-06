import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
function boot(choice: string | null = null) {
  const events: any[] = [],
    stored = new Map<string, string>();
  if (choice) stored.set("autolister.measurement-consent.v1", choice);
  const w: any = {
    location: {
      reload: vi.fn(),
      hostname: "autolister.app",
      pathname: "/success",
      search: "?session_id=cs_live_fixture",
      href: "https://autolister.app/success?session_id=cs_live_fixture",
    },
    localStorage: {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
      removeItem: (k: string) => stored.delete(k),
    },
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  const callbacks: Record<string, Function> = {};
  const buttons = ["rejected", "accepted"].map((choice) => ({
    style: {},
    dataset: { choice },
    addEventListener: (_: string, cb: Function) => {
      callbacks[choice] = cb;
    },
  }));
  const document: any = {
    readyState: "loading",
    addEventListener: vi.fn(),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn() },
    getElementById: () => null,
    createElement: () => ({
      style: {},
      setAttribute: vi.fn(),
      addEventListener: (_: string, cb: Function) => {
        callbacks.settings = cb;
      },
      querySelector: () => ({ style: {} }),
      querySelectorAll: () => buttons,
    }),
    cookie: "",
  };
  const fetch = vi.fn();
  const context = {
    window: w,
    document,
    URL,
    URLSearchParams,
    Set,
    Date,
    fetch,
    setTimeout: vi.fn(),
    CustomEvent: class {},
    console,
  };
  vm.runInNewContext(
    readFileSync("public/purchase-measurement.js", "utf8"),
    context,
  );
  w.dataLayer.forEach((e: any) => events.push(Array.from(e)));
  return { w, events, document, fetch, stored, callbacks };
}
const purchase = {
  transaction_id: "in_fixture",
  value: 3.99,
  currency: "EUR",
  new_customer: true,
};
it("does not load Google or count purchases without consent", () => {
  const t = boot();
  t.w.AutoListerMeasurement.purchase(purchase);
  expect(t.document.head.appendChild).not.toHaveBeenCalled();
  expect(t.w.dataLayer.some((e: any) => e[0] === "event")).toBe(false);
});
it("sends one verified purchase and deduplicates repeats", () => {
  const t = boot("accepted");
  t.w.AutoListerMeasurement.purchase(purchase);
  t.w.AutoListerMeasurement.purchase(purchase);
  const events = t.w.dataLayer.filter((e: any) => e[0] === "event");
  expect(events).toHaveLength(1);
  expect(events[0][2]).toMatchObject({
    send_to: "AW-18434567859/TMdVCLelxLMdELPdpNZE",
    ...purchase,
  });
});
it("rejects invalid values and test transactions", () => {
  const t = boot("accepted");
  for (const p of [
    { ...purchase, value: 0 },
    { ...purchase, transaction_id: "cs_test_x" },
    { ...purchase, new_customer: false },
    null,
  ])
    t.w.AutoListerMeasurement.purchase(p);
  expect(t.w.dataLayer.some((e: any) => e[0] === "event")).toBe(false);
});
it("strips checkout secrets from the Google page URL", () => {
  const t = boot("accepted");
  const config = t.w.dataLayer.find((e: any) => e[0] === "config");
  expect(config[2].page_location).toBe("https://autolister.app/success");
});

it("persists withdrawal and reloads to stop the loaded measurement runtime", () => {
  const t = boot("accepted");
  t.document.addEventListener.mock.calls[0][1]();
  t.callbacks.settings();
  t.callbacks.rejected();
  expect(t.stored.get("autolister.measurement-consent.v1")).toBe("rejected");
  expect(t.w.location.reload).toHaveBeenCalledOnce();
  t.w.AutoListerMeasurement.purchase(purchase);
  expect(t.w.dataLayer.some((e: any) => e[0] === "event")).toBe(false);
});
