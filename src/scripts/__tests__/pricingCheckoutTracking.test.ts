import vm from "node:vm";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { beforeAll, expect, it, vi } from "vitest";

let bundled: string;
beforeAll(async () => {
  const { outputFiles } = await build({
    stdin: {
      contents:
        readFileSync("src/scripts/pricing.js", "utf8") +
        `\nglobalThis.pricingTest = {
          subscription: () => handlePaidPlanSelection("pro"),
          credits: handleCreditPackClick,
          portal: openCustomerPortal,
          signIn() { currentUser = { email: "fixture@example.com" }; hasExtension = true; }
        };`,
      resolveDir: process.cwd() + "/src/scripts",
    },
    plugins: [
      {
        name: "capture-analytics",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/analytics\.js$/ }, () => ({
            path: "analytics",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const trackEvent = (...args) => globalThis.recordEvent(...args);",
          }));
        },
      },
    ],
    bundle: true,
    format: "iife",
    write: false,
  });
  bundled = outputFiles[0].text;
});

function fixture(outcome = "success") {
  const events: any[] = [];
  const pending = { closed: false, location: { href: "" }, close: vi.fn() };
  const label = { textContent: "Buy credits" };
  const button = { disabled: false, querySelector: () => label };
  const fetch = vi.fn(async () => {
    if (outcome === "network") throw new TypeError("Failed to fetch");
    return {
      ok: outcome === "success",
      status: outcome === "success" ? 200 : 503,
      json: async () => {
        if (outcome === "invalid-json") throw new SyntaxError("Invalid JSON");
        return outcome === "success"
          ? { url: "https://checkout.stripe.com/fixture" }
          : { error: "Temporarily unavailable" };
      },
    };
  });
  const context: any = {
    console: { error() {}, warn() {} },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch,
    recordEvent(event: string, properties: any) {
      events.push({ event, properties });
      return new Promise(() => {});
    },
    document: {
      documentElement: { lang: "en" },
      getElementById(id: string) {
        return id === "btn-credit-pack"
          ? button
          : { textContent: "", style: {} };
      },
      querySelectorAll: () => [],
    },
    window: {
      location: new URL("https://autolister.app/pricing"),
      open: () => pending,
      addEventListener() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(bundled, context);
  context.pricingTest.signIn();
  return { context, events, fetch, pending, button, label };
}

it.each(["subscription", "credits", "portal"])(
  "correlates %s completion without waiting for telemetry or repeating checkout",
  async (kind) => {
    const f = fixture();
    await f.context.pricingTest[kind]();
    const boundaries = f.events.filter(({ event }) =>
      /checkout_(start|opened)|billing_portal_(start|opened)/.test(event),
    );
    expect(boundaries).toHaveLength(2);
    const id = boundaries[0].properties.context.operationId;
    expect(id).toEqual(expect.any(String));
    expect(id.length).toBeGreaterThan(10);
    expect(boundaries[1].properties.context.operationId).toBe(id);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.pending.location.href).toBe("https://checkout.stripe.com/fixture");
    expect(f.button.disabled).toBe(false);
    await f.context.pricingTest[kind]();
    const starts = f.events.filter(({ event }) =>
      /^(checkout_start|billing_portal_start)$/.test(event),
    );
    expect(starts[1].properties.context.operationId).not.toBe(id);
  },
);

it.each(
  ["subscription", "credits", "portal"].flatMap((kind) =>
    ["network", "server", "invalid-json"].map((outcome) => [kind, outcome]),
  ),
)(
  "closes the %s tracking operation on %s failure and keeps retry controls available",
  async (kind, outcome) => {
    const f = fixture(outcome);
    await f.context.pricingTest[kind]();
    const start = f.events.find(({ event }) =>
      /^(checkout_start|billing_portal_start)$/.test(event),
    );
    const failure = f.events.find(({ event }) => event === "checkout_failed");
    expect(failure?.properties.context).toMatchObject({
      operationId: start?.properties.context.operationId,
      stage: "checkout_requested",
      checkoutKind: kind,
    });
    expect(failure?.properties.context.errorCode).toEqual(expect.any(String));
    expect(
      f.events.some(({ event }) =>
        /^(checkout_opened|billing_portal_opened)$/.test(event),
      ),
    ).toBe(false);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.pending.close).toHaveBeenCalledTimes(1);
    expect(f.button.disabled).toBe(false);
    expect(f.label.textContent).toBe("Buy credits");
  },
);
