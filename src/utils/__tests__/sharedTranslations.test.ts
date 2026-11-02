import { describe, expect, it, vi } from "vitest";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { uiText } from "../../app/mobile-web/ui";
import { getTranslation } from "../../app/mobile-web/styleTranslations";
import common from "../../data/sharedUiCopy.json";

const root = process.cwd();
const script = resolve(root, "scripts/sync-shared-translations.mjs");
const run = (args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe("shared translation build boundary", () => {
  it("honors a canonical English edit in the app and uploader while retaining local English variants", async () => {
    const edited = structuredClone(common);
    edited.messages["action.close"].en = "Dismiss";
    const billing = JSON.parse(
      readFileSync(resolve(root, "src/data/billingCopy.json"), "utf8"),
    );
    billing.en.subscriptionTrust = "Updated checkout wording";
    billing.nl.subscriptionTrust = "Bijgewerkte betaaltekst";
    vi.doMock("../../data/sharedUiCopy.json", () => ({ default: edited }));
    vi.doMock("../../data/billingCopy.json", () => ({ default: billing }));
    vi.resetModules();
    try {
      const fresh = await import("../../app/mobile-web/ui.js");
      expect(fresh.uiText("Close", "en")).toBe("Dismiss");
      expect(fresh.uiText("New", "en")).toBe("New");
      expect(
        fresh.uiText("Secure checkout by Stripe. Cancel anytime.", "en"),
      ).toBe("Updated checkout wording");
      expect(
        fresh.uiText("Secure checkout by Stripe. Cancel anytime.", "nl"),
      ).toBe("Bijgewerkte betaaltekst");
      const endpoint =
        await import("../../pages/ui-components/web-app-copy.js.js");
      const browser = vm.createContext({
        navigator: { languages: ["en"] },
        document: {
          documentElement: {},
          createTreeWalker: () => ({ nextNode: () => null }),
          querySelectorAll: () => [],
        },
      });
      browser.window = browser;
      vm.runInContext(await endpoint.GET().text(), browser);
      vm.runInContext(
        readFileSync(resolve(root, "public/web-app-ui-runtime.js"), "utf8"),
        browser,
      );
      expect(browser.AutoListerWebUi.text("Close")).toBe("Dismiss");
      expect(
        browser.AutoListerWebUi.text(
          "Secure checkout by Stripe. Cancel anytime.",
        ),
      ).toBe("Updated checkout wording");
      expect(browser.AutoListerWebUi.text("New")).toBe("New");
    } finally {
      vi.doUnmock("../../data/sharedUiCopy.json");
      vi.doUnmock("../../data/billingCopy.json");
      vi.resetModules();
    }
  });
  it("uses the canonical text in real web consumers while preserving context-specific words", () => {
    const browser = vm.createContext({ navigator: { languages: ["nl"] } });
    vm.runInContext(
      readFileSync(resolve(root, "public/shared-ui-copy.js"), "utf8"),
      browser,
    );
    vm.runInContext(
      readFileSync(resolve(root, "public/user-model-copy.js"), "utf8"),
      browser,
    );
    expect(uiText("Seller note", "nl")).toBe(
      common.messages["listing.sellerNote"].nl,
    );
    expect(getTranslation("nl").ui.note).toBe(
      common.messages["listing.sellerNote"].nl,
    );
    expect(browser.AutoListerModelCopy.text("Close")).toBe(
      common.messages["action.close"].nl,
    );
    expect(uiText("New", "nl")).toBe("Artikel toevoegen");
    expect(browser.AutoListerModelCopy.text("New")).toBe("Nieuw");
    expect(uiText("Generate", "nl")).toBe("Concept genereren");
    expect(uiText("Paragraphs", "nl")).toBe("Tekst");
  });
  it("keeps the checked-in web bundle synchronized with its canonical catalogs", () => {
    const result = run(["--check"]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("propagates a single canonical edit to both bundled consumers and detects drift", () => {
    const fixture = mkdtempSync(join(tmpdir(), "autolister-shared-copy-"));
    try {
      const web = join(fixture, "web"),
        extension = join(fixture, "extension");
      mkdirSync(join(web, "src/data"), { recursive: true });
      mkdirSync(join(web, "public"));
      mkdirSync(extension);
      writeFileSync(
        join(extension, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          content_scripts: [
            {
              js: [
                "lib/shared-ui-copy.js",
                "lib/billing-catalog.js",
                "lib/user-model-copy.js",
                "content.js",
              ],
            },
          ],
        }),
      );
      const common = JSON.parse(
        readFileSync(resolve(root, "src/data/sharedUiCopy.json"), "utf8"),
      );
      const billing = readFileSync(
        resolve(root, "src/data/billingCopy.json"),
        "utf8",
      );
      common.messages["action.close"].nl = "Testsluiting";
      writeFileSync(
        join(web, "src/data/sharedUiCopy.json"),
        JSON.stringify(common),
      );
      writeFileSync(join(web, "src/data/billingCopy.json"), billing);
      const modelSource = readFileSync(
        resolve(root, "public/user-model-copy.js"),
        "utf8",
      );
      writeFileSync(join(web, "public/user-model-copy.js"), modelSource);
      const args = ["--source-root", web, "--extension-root", extension];
      const generated = run(args);
      expect(generated.status, generated.stdout + generated.stderr).toBe(0);
      const webCode = readFileSync(
        join(web, "public/shared-ui-copy.js"),
        "utf8",
      );
      expect(
        readFileSync(join(extension, "lib/shared-ui-copy.js"), "utf8"),
      ).toBe(webCode);
      expect(
        readFileSync(join(extension, "lib/user-model-copy.js"), "utf8"),
      ).toBe(modelSource);
      const browser = vm.createContext({
        fetch: () => {
          throw Error("Must work offline");
        },
      });
      vm.runInContext(webCode, browser);
      expect(browser.AutoListerSharedUiCopy.get("action.close", "nl-NL")).toBe(
        "Testsluiting",
      );
      expect(browser.AutoListerSharedUiCopy.get("action.close", "cs-CZ")).toBe(
        "Zavřít",
      );
      expect(
        browser.AutoListerSharedUiCopy.get("action.close", "unsupported"),
      ).toBe("Close");
      expect(browser.AutoListerSharedUiCopy.billing.nl.monthly).toBe(
        "Maandelijks",
      );
      writeFileSync(
        join(extension, "lib/shared-ui-copy.js"),
        webCode + "\n// stale edit",
      );
      const stale = run([...args, "--check"]);
      expect(stale.status).not.toBe(0);
      expect(stale.stdout + stale.stderr).toContain("shared-ui-copy.js");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("rejects missing locales and changed placeholders before writing any output", () => {
    const fixture = mkdtempSync(join(tmpdir(), "autolister-shared-copy-"));
    try {
      mkdirSync(join(fixture, "src/data"), { recursive: true });
      const common = JSON.parse(
        readFileSync(resolve(root, "src/data/sharedUiCopy.json"), "utf8"),
      );
      const billing = JSON.parse(
        readFileSync(resolve(root, "src/data/billingCopy.json"), "utf8"),
      );
      delete common.messages["action.close"].nl;
      writeFileSync(
        join(fixture, "src/data/sharedUiCopy.json"),
        JSON.stringify(common),
      );
      writeFileSync(
        join(fixture, "src/data/billingCopy.json"),
        JSON.stringify(billing),
      );
      let invalid = run(["--source-root", fixture]);
      expect(invalid.status).not.toBe(0);
      expect(invalid.stdout + invalid.stderr).toContain("action.close");
      common.messages["action.close"].nl = "Sluiten";
      billing.nl.continueWith = "Doorgaan";
      writeFileSync(
        join(fixture, "src/data/sharedUiCopy.json"),
        JSON.stringify(common),
      );
      writeFileSync(
        join(fixture, "src/data/billingCopy.json"),
        JSON.stringify(billing),
      );
      invalid = run(["--source-root", fixture]);
      expect(invalid.status).not.toBe(0);
      expect(invalid.stdout + invalid.stderr).toContain("continueWith");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("refuses to synchronize into a directory that is not an extension checkout", () => {
    const fixture = mkdtempSync(join(tmpdir(), "autolister-shared-copy-"));
    try {
      const result = run(["--extension-root", fixture]);
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("extension manifest");
      writeFileSync(
        join(fixture, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          content_scripts: [{ js: ["content.js"] }],
        }),
      );
      const oldConsumer = run(["--extension-root", fixture]);
      expect(oldConsumer.status).not.toBe(0);
      expect(oldConsumer.stdout + oldConsumer.stderr).toContain(
        "Integrate the shared translation runtime",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
