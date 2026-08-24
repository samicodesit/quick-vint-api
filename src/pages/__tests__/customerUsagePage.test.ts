import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function createElement() {
  const classes = new Set(["hidden"]);
  return {
    textContent: "",
    style: { width: "" },
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) =>
        names.forEach((name) => classes.delete(name)),
      toggle: (name: string, force?: boolean) => {
        if (force === false) classes.delete(name);
        else if (force === true) classes.add(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
      contains: (name: string) => classes.has(name),
    },
  };
}

describe("customer usage page", () => {
  it("shows a concise payment action instead of active remaining usage", async () => {
    const source = readFileSync("src/pages/customer-usage.astro", "utf8");
    const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, ReturnType<typeof createElement>>();
    const sandbox = {
      URLSearchParams,
      Date,
      Number,
      document: {
        getElementById(id: string) {
          if (!elements.has(id)) elements.set(id, createElement());
          return elements.get(id);
        },
      },
      window: { location: { search: "?preview=payment_required" } },
      fetch: async () => {
        throw new Error("preview mode should not fetch");
      },
    };

    vm.runInNewContext(script!, sandbox);
    await new Promise((resolve) => setImmediate(resolve));

    expect(elements.get("headline")?.textContent).toBe("Payment failed");
    expect(elements.get("subline")?.textContent).toBe(
      "Update payment to continue using AutoLister.",
    );
    expect(elements.get("statusText")?.textContent).toBe("Payment needed");
    expect(elements.get("usagePanel")?.classList.contains("hidden")).toBe(
      false,
    );
  });
});
