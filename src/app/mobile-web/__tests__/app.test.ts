import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as mobileWebApp from "../app.js";

const stylesheet = readFileSync("src/styles/mobile-web-app.css", "utf8");

import {
  canReuseMobileGenerationUpload,
  getMobileUsageSummary,
  renderMobileUsage,
  clearMobileUsage,
  getMobileCopyAnalyticsContext,
  resetMobileCopyStateOnEdit,
  revokeMobileUploadedPreviews,
  closeMobileLanguageMenus,
  toggleMobileLanguageMenu,
  toggleMobileProfileMenu,
  getMobilePhotoLayoutState,
  getMobileGenerateButtonState,
  mountMobileWebApp,
} from "../app.js";

class FakeElement {
  hidden = true;
  disabled = false;
  value = "";
  textContent = "";
  style = { width: "" };
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

function createUsageDom() {
  const elements = new Map<string, FakeElement>();
  const selectors = [
    '[data-mobile-web="usage-headline"]',
    '[data-mobile-web="usage-free"]',
    '[data-mobile-web="usage-free-value"]',
    '[data-mobile-web="usage-paid"]',
    '[data-mobile-web="usage-credits"]',
    '[data-mobile-web="usage-credits-value"]',
    '[data-mobile-web="usage-daily-value"]',
    '[data-mobile-web="usage-daily-track"]',
    '[data-mobile-web="usage-daily-progress"]',
    '[data-mobile-web="usage-monthly-value"]',
    '[data-mobile-web="usage-monthly-track"]',
    '[data-mobile-web="usage-monthly-progress"]',
  ];
  selectors.forEach((selector) => elements.set(selector, new FakeElement()));
  const root = {
    querySelector: <T extends Element = Element>(selector: string) =>
      (elements.get(selector) ?? null) as T | null,
  } as unknown as ParentNode;
  return { root, elements };
}

class RuntimePhotoNode {
  hidden = false;
  disabled = false;
  value = "";
  textContent = "";
  className = "";
  type = "";
  src = "";
  alt = "";
  loading = "";
  style = { width: "" };
  dataset: Record<string, string> = {};
  children: RuntimePhotoNode[] = [];
  parentNode: RuntimePhotoNode | null = null;
  private readonly attributes = new Map<string, string>();

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...nodes: RuntimePhotoNode[]): void {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  insertBefore(node: RuntimePhotoNode, reference: RuntimePhotoNode): void {
    node.parentNode = this;
    const index = this.children.indexOf(reference);
    if (index === -1) this.children.push(node);
    else this.children.splice(index, 0, node);
  }

  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(
      (child) => child !== this,
    );
    this.parentNode = null;
  }

  querySelector<T extends RuntimePhotoNode = RuntimePhotoNode>(
    selector: string,
  ): T | null {
    return (this.querySelectorAll(selector)[0] as T | undefined) ?? null;
  }

  querySelectorAll<T extends RuntimePhotoNode = RuntimePhotoNode>(
    selector: string,
  ): T[] {
    const matches: RuntimePhotoNode[] = [];
    const visit = (node: RuntimePhotoNode): void => {
      node.children.forEach((child) => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches as T[];
  }

  matches(selector: string): boolean {
    if (selector === "img") return this.tagName === "img";
    if (selector === "[data-photo-id]") return "photoId" in this.dataset;
    if (selector === "[data-photo-remove]")
      return "photoRemove" in this.dataset;
    if (selector === '[data-mobile-web="photo-list"]')
      return this.dataset.mobileWeb === "photo-list";
    if (selector === '[data-mobile-web="photo-empty-state"]')
      return this.dataset.mobileWeb === "photo-empty-state";
    if (selector === '[data-mobile-web="photo-count"]')
      return this.dataset.mobileWeb === "photo-count";
    if (selector === '[data-mobile-web="generate"]')
      return this.dataset.mobileWeb === "generate";
    if (selector === '[data-mobile-web="add-photo"]')
      return this.dataset.mobileWeb === "add-photo";
    return false;
  }
}

function createRuntimePhotoDom() {
  const root = new RuntimePhotoNode("main");
  const emptyState = new RuntimePhotoNode("button");
  emptyState.setAttribute("data-mobile-web", "photo-empty-state");
  const list = new RuntimePhotoNode("div");
  list.setAttribute("data-mobile-web", "photo-list");
  const count = new RuntimePhotoNode("p");
  count.setAttribute("data-mobile-web", "photo-count");
  const generate = new RuntimePhotoNode("button");
  generate.setAttribute("data-mobile-web", "generate");
  const add = new RuntimePhotoNode("button");
  add.setAttribute("data-mobile-web", "add-photo");
  list.append(add);
  root.append(emptyState, list, count, generate);
  return { root, emptyState, list, count, generate };
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

  it("opens and closes the account menu through its trigger state", () => {
    const trigger = { setAttribute: vi.fn() };
    const menu = { hidden: true };
    const root = {
      querySelector: vi.fn((selector: string) => {
        if (selector === '[data-mobile-web="profile-menu-trigger"]')
          return trigger;
        if (selector === '[data-mobile-web="profile-menu"]') return menu;
        return null;
      }),
    } as unknown as ParentNode;

    toggleMobileProfileMenu(root);
    expect(menu.hidden).toBe(false);
    expect(trigger.setAttribute).toHaveBeenLastCalledWith(
      "aria-expanded",
      "true",
    );

    toggleMobileProfileMenu(root);
    expect(menu.hidden).toBe(true);
    expect(trigger.setAttribute).toHaveBeenLastCalledWith(
      "aria-expanded",
      "false",
    );
  });

  it("summarizes the free lifetime quota and keeps credits separate", () => {
    expect(
      getMobileUsageSummary({
        plan: { tier: "free", isPaid: false },
        limits: { freeLifetime: 5, daily: null, monthly: null },
        remaining: {
          freeLifetime: 3,
          daily: null,
          monthly: null,
          minute: 1,
          packCredits: 5,
        },
        canGenerate: true,
      }),
    ).toMatchObject({
      tier: "free",
      headline: "3 of 5 listings remaining",
      credits: 5,
      free: { used: 2, remaining: 3, limit: 5 },
      daily: null,
      monthly: null,
    });
  });

  it("summarizes paid daily and monthly quotas without presenting minute capacity", () => {
    const summary = getMobileUsageSummary({
      plan: { tier: "pro", isPaid: true },
      limits: { daily: 10, monthly: 50 },
      remaining: {
        freeLifetime: null,
        daily: 2,
        monthly: 20,
        minute: 1,
        packCredits: 4,
      },
      canGenerate: true,
    });
    expect(summary).toMatchObject({
      tier: "paid",
      headline: "Usage",
      credits: 4,
      daily: { used: 8, remaining: 2, limit: 10, unlimited: false },
      monthly: { used: 30, remaining: 20, limit: 50, unlimited: false },
    });
    expect(summary).not.toHaveProperty("minute");
  });

  it("labels a null daily quota as no daily cap", () => {
    expect(
      getMobileUsageSummary({
        plan: { tier: "starter", isPaid: true },
        limits: { daily: null, monthly: 75 },
        remaining: { daily: null, monthly: 68, minute: 1, packCredits: 0 },
        canGenerate: true,
      }).daily,
    ).toMatchObject({
      used: null,
      remaining: null,
      limit: null,
      unlimited: true,
    });
  });

  it("renders the free quota and conditional credits through the usage selectors", () => {
    const { root, elements } = createUsageDom();

    renderMobileUsage(root, {
      plan: { tier: "free", isPaid: false },
      limits: { freeLifetime: 5 },
      remaining: { freeLifetime: 3, packCredits: 5, minute: 1 },
      canGenerate: true,
    });

    expect(elements.get('[data-mobile-web="usage-headline"]')?.hidden).toBe(
      true,
    );
    expect(elements.get('[data-mobile-web="usage-free"]')?.hidden).toBe(false);
    expect(elements.get('[data-mobile-web="usage-paid"]')?.hidden).toBe(true);
    expect(
      elements.get('[data-mobile-web="usage-free-value"]')?.textContent,
    ).toBe("2 / 5");
    expect(elements.get('[data-mobile-web="usage-credits"]')?.hidden).toBe(
      false,
    );
    expect(
      elements.get('[data-mobile-web="usage-credits-value"]')?.textContent,
    ).toBe("5");
    expect(
      elements.get('[data-mobile-web="usage-headline"]')?.textContent,
    ).not.toContain("minute");
  });

  it("renders paid quota values and proportional progress without minute capacity", () => {
    const { root, elements } = createUsageDom();

    renderMobileUsage(root, {
      plan: { tier: "pro", isPaid: true },
      limits: { daily: 10, monthly: 50 },
      remaining: { daily: 2, monthly: 20, minute: 1, packCredits: 0 },
      canGenerate: true,
    });

    expect(elements.get('[data-mobile-web="usage-paid"]')?.hidden).toBe(false);
    expect(elements.get('[data-mobile-web="usage-free"]')?.hidden).toBe(true);
    expect(elements.get('[data-mobile-web="usage-headline"]')?.hidden).toBe(
      true,
    );
    expect(
      elements.get('[data-mobile-web="usage-daily-value"]')?.textContent,
    ).toBe("8 / 10");
    expect(
      elements.get('[data-mobile-web="usage-monthly-value"]')?.textContent,
    ).toBe("30 / 50");
    expect(
      elements.get('[data-mobile-web="usage-daily-progress"]')?.style.width,
    ).toBe("80%");
    expect(
      elements.get('[data-mobile-web="usage-monthly-progress"]')?.style.width,
    ).toBe("60%");
    expect(elements.get('[data-mobile-web="usage-daily-track"]')?.hidden).toBe(
      false,
    );
    expect(elements.get('[data-mobile-web="usage-credits"]')?.hidden).toBe(
      true,
    );
    expect(
      elements.get('[data-mobile-web="usage-monthly-value"]')?.textContent,
    ).not.toContain("minute");
  });

  it("renders no daily cap and hides stale quota rows after a usage refresh failure", () => {
    const { root, elements } = createUsageDom();

    renderMobileUsage(root, {
      plan: { tier: "starter", isPaid: true },
      limits: { daily: null, monthly: 75 },
      remaining: { daily: null, monthly: 68, packCredits: 4 },
      canGenerate: true,
    });

    expect(
      elements.get('[data-mobile-web="usage-daily-value"]')?.textContent,
    ).toBe("No daily cap");
    expect(elements.get('[data-mobile-web="usage-daily-track"]')?.hidden).toBe(
      true,
    );

    clearMobileUsage(root);

    expect(
      elements.get('[data-mobile-web="usage-headline"]')?.textContent,
    ).toBe("Usage unavailable");
    expect(elements.get('[data-mobile-web="usage-paid"]')?.hidden).toBe(true);
    expect(elements.get('[data-mobile-web="usage-free"]')?.hidden).toBe(true);
    expect(elements.get('[data-mobile-web="usage-credits"]')?.hidden).toBe(
      true,
    );
    expect(
      elements.get('[data-mobile-web="usage-monthly-track"]')?.hidden,
    ).toBe(true);
    expect(
      elements.get('[data-mobile-web="usage-monthly-progress"]')?.style.width,
    ).toBe("0%");
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

  it("switches between the empty photo state and the compact populated rail", () => {
    expect(getMobilePhotoLayoutState(0)).toEqual({
      hasPhotos: false,
      showEmptyState: true,
      showPhotoRail: false,
      countLabel: "No photos yet",
    });
    expect(getMobilePhotoLayoutState(3)).toEqual({
      hasPhotos: true,
      showEmptyState: false,
      showPhotoRail: true,
      countLabel: "3 photos selected",
    });
  });

  it("renders runtime photo tiles with the global rail and remove affordance contract", () => {
    const renderPhotos = (
      mobileWebApp as typeof mobileWebApp & {
        renderPhotos?: (
          root: ParentNode,
          photos: Array<{ id: string; file: File; previewUrl: string }>,
        ) => void;
      }
    ).renderPhotos;
    expect(typeof renderPhotos).toBe("function");
    if (!renderPhotos) return;

    const { root, emptyState, list, count, generate } = createRuntimePhotoDom();
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tagName: string) => new RuntimePhotoNode(tagName),
      },
    });

    try {
      renderPhotos(root as unknown as ParentNode, [
        {
          id: "photo-a",
          file: {} as File,
          previewUrl: "blob:photo-a",
        },
      ]);

      const tile = list.querySelector<RuntimePhotoNode>("[data-photo-id]");
      const image = tile?.querySelector<RuntimePhotoNode>("img");
      const remove = tile?.querySelector<RuntimePhotoNode>(
        "[data-photo-remove]",
      );
      expect(tile?.className).toBe("photo-tile");
      expect(image?.src).toBe("blob:photo-a");
      expect(remove?.className).toBe("photo-remove");
      expect(remove?.dataset.photoRemove).toBe("photo-a");
      expect(remove?.getAttribute("aria-label")).toBe("Remove photo 1");
      expect(list.children.map((child) => child.dataset.photoId)).toEqual([
        "photo-a",
        undefined,
      ]);
      expect(emptyState.hidden).toBe(true);
      expect(list.hidden).toBe(false);
      expect(count.textContent).toBe("1 photo selected");
      expect(generate.disabled).toBe(false);
      expect(stylesheet).toMatch(
        /\.photo-tile,\s*\.photo-add\s*\{[\s\S]*?flex:\s*0 0 68px/,
      );
      expect(stylesheet).toMatch(
        /\.photo-tile img\s*\{[\s\S]*?object-fit:\s*cover/,
      );
      expect(stylesheet).toMatch(
        /\.photo-remove\s*\{[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/,
      );
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });

  it("keeps the generate CTA disabled with a useful helper until it can run", () => {
    expect(
      getMobileGenerateButtonState({
        status: "idle",
        canGenerate: true,
        hasPhotos: false,
      }),
    ).toEqual({ disabled: true, helper: "Add at least one photo to continue" });
    expect(
      getMobileGenerateButtonState({
        status: "idle",
        canGenerate: true,
        hasPhotos: true,
      }),
    ).toEqual({ disabled: false, helper: "" });
    expect(
      getMobileGenerateButtonState({
        status: "generating",
        canGenerate: true,
        hasPhotos: true,
      }),
    ).toEqual({ disabled: true, helper: "" });
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
