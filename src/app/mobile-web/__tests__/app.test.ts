import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  canReuseMobileGenerationUpload,
  getMobileUsageDisplay,
  getMobileCopyAnalyticsContext,
  resetMobileCopyStateOnEdit,
  revokeMobileUploadedPreviews,
  closeMobileLanguageMenus,
  toggleMobileLanguageMenu,
  mountMobileWebApp,
} from "../app.js";

class FakeElement {
  hidden = true;
  disabled = false;
  value = "";
  textContent = "";
  dataset: Record<string, string> = {};
  private readonly listeners = new Map<string, EventListener>();

  constructor(private readonly matchesWorkspace = false) {}

  matches(selector: string): boolean {
    return (
      this.matchesWorkspace && selector === '[data-mobile-web="workspace"]'
    );
  }

  querySelector<T extends Element = Element>(): T | null {
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  addEventListener(event: string, listener: EventListener): void {
    this.listeners.set(event, listener);
  }

  removeEventListener(event: string, listener: EventListener): void {
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
  }

  setAttribute(): void {}

  closest(): null {
    return null;
  }
}

describe("mobile web app state helpers", () => {
  it("mounts when the workspace element itself is passed as the root", async () => {
    const authCard = new FakeElement();
    const workspace = new FakeElement(true);
    const elements = new Map<string, FakeElement>([
      ['[data-mobile-web="auth-card"]', authCard],
    ]);
    workspace.querySelector = ((selector: string) =>
      selector === '[data-mobile-web="workspace"]'
        ? null
        : (elements.get(selector) ??
          new FakeElement())) as typeof workspace.querySelector;

    const storage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNavigator = globalThis.navigator;
    const previousLocalStorage = globalThis.localStorage;
    Object.assign(globalThis, {
      window: {
        __AUTOLISTER_MOBILE_WEB_CONFIG__: {
          supabaseUrl: "https://example.supabase.co",
          supabaseAnonKey: "anon",
        },
        localStorage: storage,
        location: {
          origin: "http://localhost:4321",
          hostname: "localhost",
          href: "http://localhost:4321/app",
        },
        history: { replaceState: () => undefined },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      document: {
        body: workspace,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      localStorage: storage,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { languages: ["en-US"], language: "en-US" },
    });

    try {
      mountMobileWebApp(
        workspace as unknown as HTMLElement & {
          __mobileWebCleanup?: () => void;
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(authCard.hidden).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: previousDocument,
      });
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        writable: true,
        value: previousNavigator,
      });
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: previousLocalStorage,
      });
    }
  });

  it("opens one language menu at a time and keeps trigger state accessible", () => {
    const titleTrigger = {
      setAttribute: vi.fn(),
    };
    const descriptionTrigger = {
      setAttribute: vi.fn(),
    };
    const titleMenu = {
      hidden: true,
      dataset: { mobileLanguageMenu: "title" },
    };
    const descriptionMenu = {
      hidden: true,
      dataset: { mobileLanguageMenu: "description" },
    };
    const root = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-mobile-language-trigger="title"]')
          return titleTrigger;
        if (selector === '[data-mobile-language-trigger="description"]')
          return descriptionTrigger;
        if (selector === '[data-mobile-language-menu="title"]')
          return titleMenu;
        if (selector === '[data-mobile-language-menu="description"]')
          return descriptionMenu;
        return null;
      }),
      querySelectorAll: vi.fn(() => [titleMenu, descriptionMenu]),
    } as unknown as ParentNode;

    toggleMobileLanguageMenu(root, "title");
    expect(titleMenu.hidden).toBe(false);
    expect(descriptionMenu.hidden).toBe(true);
    expect(titleTrigger.setAttribute).toHaveBeenLastCalledWith(
      "aria-expanded",
      "true",
    );

    toggleMobileLanguageMenu(root, "description");
    expect(titleMenu.hidden).toBe(true);
    expect(descriptionMenu.hidden).toBe(false);
    expect(titleTrigger.setAttribute).toHaveBeenLastCalledWith(
      "aria-expanded",
      "false",
    );
    expect(descriptionTrigger.setAttribute).toHaveBeenLastCalledWith(
      "aria-expanded",
      "true",
    );

    closeMobileLanguageMenus(root);
    expect(titleMenu.hidden).toBe(true);
    expect(descriptionMenu.hidden).toBe(true);
    expect(descriptionTrigger.setAttribute).toHaveBeenLastCalledWith(
      "aria-expanded",
      "false",
    );
  });

  it("shows free lifetime plus pack capacity instead of hiding pack credits", () => {
    expect(
      getMobileUsageDisplay({
        plan: { tier: "free" },
        remaining: {
          freeLifetime: 0,
          daily: null,
          monthly: null,
          minute: null,
          packCredits: 5,
        },
        canGenerate: true,
      }),
    ).toBe("5 generations left");
  });

  it("uses the effective paid capacity and the minute cap", () => {
    expect(
      getMobileUsageDisplay({
        plan: { tier: "pro" },
        remaining: {
          freeLifetime: null,
          daily: 2,
          monthly: 20,
          minute: 1,
          packCredits: 4,
        },
        canGenerate: true,
      }),
    ).toBe("1 generation left");
  });

  it("does not reuse signed URLs when the selected photo order changed", () => {
    expect(
      canReuseMobileGenerationUpload(
        ["photo-a", "photo-b"],
        ["photo-a", "photo-b"],
        2,
      ),
    ).toBe(true);
    expect(
      canReuseMobileGenerationUpload(
        ["photo-a", "photo-b"],
        ["photo-b", "photo-a"],
        2,
      ),
    ).toBe(false);
    expect(canReuseMobileGenerationUpload(["photo-a"], ["photo-a"], 0)).toBe(
      false,
    );
  });

  it("releases prepared preview URLs when upload artifacts are discarded", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    revokeMobileUploadedPreviews([
      { order: 0, name: "photo-0.jpg", url: "signed-0", previewUrl: "blob:0" },
      { order: 1, name: "photo-1.jpg", url: "signed-1" },
    ]);

    expect(revoke).toHaveBeenCalledWith("blob:0");
    revoke.mockRestore();
  });

  it("wires the Task 5 result, billing, Vinted, attribution, and analytics actions", () => {
    const appSource = readFileSync("src/app/mobile-web/app.ts", "utf8");
    const shellSource = readFileSync(
      "src/components/mobile-web/WorkspaceShell.astro",
      "utf8",
    );

    expect(appSource).toContain('from "./billing.js"');
    expect(appSource).toContain('from "./analytics.js"');
    expect(appSource).toContain("copyListingField");
    expect(appSource).toContain("getSafeVintedCreateListingUrl");
    expect(appSource).toContain("claimFirstTouchAfterAuth");
    expect(appSource).toContain("trackMobileEvent");
    expect(appSource).toContain("refreshAfterCheckout");
    expect(appSource).toContain('[data-mobile-web="copy-title"]');
    expect(appSource).toContain('[data-mobile-web="copy-description"]');
    expect(appSource).toContain('[data-mobile-web="vinted-action"]');
    expect(shellSource).toContain(
      'import ListingResult from "./ListingResult.astro"',
    );
  });

  it("reports copy success or failure without including listing text", () => {
    expect(getMobileCopyAnalyticsContext("title", true)).toEqual({
      field: "title",
      resultStatus: "success",
    });
    expect(getMobileCopyAnalyticsContext("description", false)).toEqual({
      field: "description",
      resultStatus: "failed",
    });
  });

  it("resets completion only for the field edited after copying", () => {
    expect(
      resetMobileCopyStateOnEdit("title", {
        title: true,
        description: true,
      }),
    ).toEqual({ title: false, description: true });
    expect(
      resetMobileCopyStateOnEdit("description", {
        title: true,
        description: true,
      }),
    ).toEqual({ title: true, description: false });
  });
});
