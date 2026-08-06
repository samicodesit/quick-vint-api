import vm from "node:vm";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

type ElementStub = ReturnType<typeof elementStub>;

function elementStub(textContent = "") {
  const attributes = new Map<string, string>();
  const listeners: Record<string, (event: any) => Promise<void>> = {};
  return {
    attributes,
    dataset: {} as Record<string, string>,
    hidden: false,
    href: "",
    listeners,
    rel: "",
    target: "",
    textContent,
    addEventListener(event: string, handler: (event: any) => Promise<void>) {
      listeners[event] = handler;
    },
    getAttribute(name: string) {
      return attributes.get(name) || null;
    },
    removeAttribute(name: string) {
      attributes.delete(name);
      if (name === "target") this.target = "";
      if (name === "rel") this.rel = "";
    },
    removeEventListener(event: string) {
      delete listeners[event];
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };
}

async function runWelcomeCheckout(options: {
  assignThrows?: boolean;
  intent?: unknown;
  checkoutOk?: boolean;
  gtagThrows?: boolean;
  replaceIntentDuringFetch?: unknown;
  replaceIntentOnProfile?: unknown;
  signedInInitially?: boolean;
}) {
  const { outputFiles } = await build({
    entryPoints: ["src/scripts/welcomeCheckout.js"],
    bundle: true,
    format: "iife",
    write: false,
  });
  const cta = elementStub("Go to Vinted and list now");
  cta.href = "https://www.vinted.com/items/new";
  cta.target = "_blank";
  cta.rel = "noopener noreferrer";
  cta.dataset = {
    checkoutError: "Could not continue. Please try again.",
    continuePlanTemplate: "Continue with {plan}",
    finishSignIn: "Finish signing in to continue.",
    openingCheckout: "Opening secure checkout...",
    openingSignIn: "Opening AutoLister AI...",
    selectedPlanTemplate: "{plan} selected",
  };
  const badge = elementStub("Free plan active");
  const pricing = elementStub("See pricing plans");
  const status = elementStub();
  status.hidden = true;
  const elements: Record<string, ElementStub> = {
    "welcome-plan-badge": badge,
    "welcome-primary-cta": cta,
    "welcome-pricing-cta": pricing,
    "welcome-checkout-status": status,
  };
  const storage = new Map<string, string>();
  if (options.intent) {
    storage.set(
      "autolister_pending_install_plan",
      JSON.stringify(options.intent),
    );
  }
  const messages: string[] = [];
  const requests: Array<{ url: string; body: any }> = [];
  const assigned: string[] = [];
  let now = Date.now();
  let setItemCalls = 0;
  let profileRequests = 0;
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(
        _extensionId: string,
        message: { type: string },
        callback: (response: unknown) => void,
      ) {
        messages.push(message.type);
        if (message.type === "OPEN_SIGNIN_POPUP") {
          callback({ ok: true });
          return;
        }
        profileRequests += 1;
        if (options.replaceIntentOnProfile) {
          storage.set(
            "autolister_pending_install_plan",
            JSON.stringify(options.replaceIntentOnProfile),
          );
        }
        const signedIn = options.signedInInitially || profileRequests > 1;
        callback({
          installed: true,
          signedIn,
          user: signedIn ? { id: "user-1", email: "seller@example.com" } : null,
          profile: signedIn
            ? {
                credits_balance: 0,
                subscription_status: "free",
                subscription_tier: "free",
              }
            : null,
        });
      },
    },
  };
  const localStorage = {
    getItem(key: string) {
      return storage.get(key) || null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      setItemCalls += 1;
      storage.set(key, value);
    },
  };
  const context: Record<string, any> = {
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    URLSearchParams,
    chrome,
    clearTimeout,
    console,
    document: {
      getElementById(id: string) {
        return elements[id] || null;
      },
    },
    fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) });
      if (options.replaceIntentDuringFetch) {
        storage.set(
          "autolister_pending_install_plan",
          JSON.stringify(options.replaceIntentDuringFetch),
        );
      }
      return {
        ok: options.checkoutOk !== false,
        async json() {
          return options.checkoutOk === false
            ? { error: "Checkout unavailable" }
            : { url: "https://checkout.stripe.com/c/pay" };
        },
      };
    },
    localStorage,
    setTimeout(callback: () => void) {
      callback();
      return 1;
    },
    window: {
      chrome,
      gtag: options.gtagThrows
        ? () => {
            throw new Error("analytics blocked");
          }
        : undefined,
      localStorage,
      location: {
        assign(url: string) {
          assigned.push(url);
          if (options.assignThrows) throw new Error("navigation blocked");
        },
        search: "",
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(outputFiles[0].text, context);

  return {
    advanceTime(ms: number) {
      now += ms;
    },
    assigned,
    badge,
    cta,
    messages,
    pricing,
    requests,
    setItemCalls: () => setItemCalls,
    status,
    storage,
  };
}

describe("welcome paid install checkout", () => {
  it("continues a paid install through sign-in and Stripe without leaving the welcome flow", async () => {
    const result = await runWelcomeCheckout({
      intent: {
        plan: "business",
        createdAt: Date.now(),
        utm: {
          ignored: "value",
          utm_campaign: "business",
          utm_source: "google",
        },
      },
      checkoutOk: true,
    });

    expect(result.badge.textContent).toBe("Business selected");
    expect(result.cta.textContent).toBe("Continue with Business");
    expect(result.cta.target).toBe("");

    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.messages).toEqual([
      "GET_USER_PROFILE",
      "OPEN_SIGNIN_POPUP",
      "GET_USER_PROFILE",
    ]);
    expect(result.requests).toEqual([
      {
        url: "/api/stripe/create-checkout",
        body: {
          email: "seller@example.com",
          source: "install_welcome",
          tier: "business",
          utm: {
            utm_campaign: "business",
            utm_source: "google",
          },
        },
      },
    ]);
    expect(result.assigned).toEqual(["https://checkout.stripe.com/c/pay"]);
    expect(result.storage.has("autolister_pending_install_plan")).toBe(false);
  });

  it("leaves the existing free welcome CTA completely unchanged without paid intent", async () => {
    const result = await runWelcomeCheckout({ checkoutOk: true });

    expect(result.cta.textContent).toBe("Go to Vinted and list now");
    expect(result.cta.href).toBe("https://www.vinted.com/items/new");
    expect(result.cta.target).toBe("_blank");
    expect(result.cta.listeners.click).toBeUndefined();
    expect(result.messages).toEqual([]);
  });

  it("keeps paid intent retryable when checkout creation fails", async () => {
    const result = await runWelcomeCheckout({
      intent: { plan: "pro", createdAt: Date.now() },
      checkoutOk: false,
      signedInInitially: true,
    });

    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.assigned).toEqual([]);
    expect(result.storage.has("autolister_pending_install_plan")).toBe(true);
    expect(result.cta.attributes.get("aria-busy")).toBe("false");
    expect(result.cta.textContent).toBe("Continue with Pro");
    expect(result.status.hidden).toBe(false);
    expect(result.status.textContent).toBe(
      "Could not continue. Please try again.",
    );
  });

  it("does not submit an intent that expires after the page renders", async () => {
    const result = await runWelcomeCheckout({
      intent: { plan: "pro", createdAt: Date.now() },
      checkoutOk: true,
    });

    result.advanceTime(60 * 60 * 1000 + 1);
    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.messages).toEqual([]);
    expect(result.requests).toEqual([]);
    expect(result.cta.textContent).toBe("Go to Vinted and list now");
    expect(result.cta.target).toBe("_blank");
  });

  it("does not submit when another tab replaces the intent during sign-in", async () => {
    const result = await runWelcomeCheckout({
      intent: { plan: "business", createdAt: Date.now() },
      checkoutOk: true,
      replaceIntentOnProfile: { plan: "pro", createdAt: Date.now() },
      signedInInitially: true,
    });

    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.messages).toEqual(["GET_USER_PROFILE"]);
    expect(result.requests).toEqual([]);
    expect(result.cta.textContent).toBe("Go to Vinted and list now");
    expect(result.pricing.listeners.click).toBeUndefined();
    expect(
      JSON.parse(
        result.storage.get("autolister_pending_install_plan") || "null",
      ).plan,
    ).toBe("pro");
  });

  it("does not navigate or clear a newer intent saved during checkout", async () => {
    const result = await runWelcomeCheckout({
      intent: { plan: "business", createdAt: Date.now() },
      checkoutOk: true,
      replaceIntentDuringFetch: { plan: "pro", createdAt: Date.now() + 1 },
      signedInInitially: true,
    });

    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.requests).toHaveLength(1);
    expect(result.assigned).toEqual([]);
    expect(result.cta.textContent).toBe("Go to Vinted and list now");
    expect(
      JSON.parse(
        result.storage.get("autolister_pending_install_plan") || "null",
      ).plan,
    ).toBe("pro");
  });

  it("retains the original intent when navigation fails", async () => {
    const createdAt = Date.now();
    const result = await runWelcomeCheckout({
      assignThrows: true,
      intent: { plan: "starter", createdAt },
      checkoutOk: true,
      signedInInitially: true,
    });

    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.setItemCalls()).toBe(0);
    expect(
      JSON.parse(
        result.storage.get("autolister_pending_install_plan") || "null",
      ),
    ).toEqual({ plan: "starter", createdAt });
    expect(result.cta.textContent).toBe("Continue with Starter");
  });

  it("continues checkout when optional analytics fails", async () => {
    const result = await runWelcomeCheckout({
      intent: { plan: "starter", createdAt: Date.now() },
      checkoutOk: true,
      gtagThrows: true,
      signedInInitially: true,
    });

    await result.cta.listeners.click({ preventDefault() {} });

    expect(result.assigned).toEqual(["https://checkout.stripe.com/c/pay"]);
  });
});
