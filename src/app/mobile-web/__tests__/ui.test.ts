import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getUiLocale,
  initializeUiLocale,
  uiCatalogs,
  uiError,
  uiFormat,
  uiLanguageTag,
  uiText,
} from "../ui";
import { UI_LOCALES, workspaceCopy } from "../uiCopy";
import { getMobilePaywall } from "../paywallPolicy";
import {
  DEFAULT_DRAFT_SETTINGS,
  validateDraftSettings,
} from "../draftContracts";

afterEach(() => vi.unstubAllGlobals());
const fields = (value: string) =>
  [...value.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();

describe("seller web interface localization", () => {
  it("preserves payment and recovery instructions instead of reusing unrelated labels", () => {
    expect(uiText("Manage your payment securely with Stripe.", "nl")).toBe(
      "Beheer je betaling veilig via Stripe.",
    );
    expect(uiText("Choose an item.", "nl")).toBe("Kies een artikel.");
    expect(uiText("Continue grouping", "nl")).toBe("Doorgaan met groeperen");
    expect(
      uiText(
        "This item changed in another tab. Reload its saved version.",
        "nl",
      ),
    ).toBe(
      "Dit artikel is gewijzigd in een ander tabblad. Laad de opgeslagen versie opnieuw.",
    );
    expect(uiText("Your ChatGPT draft", "nl")).toBe("Je ChatGPT-concept");
  });
  it("does not retranslate later user content when an existing root remounts", () => {
    vi.stubGlobal("navigator", { languages: ["nl"], language: "nl" });
    const node = {
      textContent: "Your drafts",
      parentElement: { closest: () => null },
    };
    const root = {
      ownerDocument: {
        createTreeWalker: () => {
          let pending = true;
          return {
            nextNode: () => {
              if (!pending) return null;
              pending = false;
              return node;
            },
          };
        },
      },
      querySelectorAll: () => [],
    } as unknown as ParentNode;
    initializeUiLocale(root);
    expect(node.textContent).toBe("Je concepten");
    node.textContent = "Your drafts";
    initializeUiLocale(root);
    expect(node.textContent).toBe("Your drafts");
  });
  it("localizes shared note validation before a save error reaches the editor", () => {
    vi.stubGlobal("navigator", { languages: ["nl"], language: "nl" });
    expect(() =>
      validateDraftSettings({
        ...DEFAULT_DRAFT_SETTINGS,
        descriptionFooterText: "https://example.com",
      }),
    ).toThrow(
      "De notitie mag geen links, e-mailadressen of telefoonnummers bevatten.",
    );
  });
  it("never translates native file-drag types or protocol enum values", () => {
    for (const value of [
      "Files",
      "POST",
      "professional",
      "waiting",
      "account_paused",
      "RAW photo",
    ]) {
      expect(uiText(value, "nl")).toBe(value);
    }
  });
  it("uses the first supported browser language, including Czech regional aliases", () => {
    expect(getUiLocale(["xx-ZZ", "cs-CZ", "fr"])).toBe("cz");
    expect(getUiLocale(["xx", "fr-CA"])).toBe("fr");
    expect(uiLanguageTag("cz")).toBe("cs");
    expect(getUiLocale(["xx-ZZ"])).toBe("en");
  });
  it("does not read listing language or saved user content to select UI language", () => {
    vi.stubGlobal("navigator", { languages: ["nl-NL"], language: "nl-NL" });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Listing preferences must not be read");
      },
    });
    expect(uiText("Prepare item")).toBe("Artikel voorbereiden");
    expect(
      uiError(
        "This account is paused because it appears linked to duplicate free-trial usage. To continue, contact support or choose a paid option.",
      ),
    ).toContain("gratis proefperiode");
  });
  it.each(UI_LOCALES)(
    "has complete catalogs and intact placeholders for %s",
    (locale) => {
      expect(Object.keys(uiCatalogs[locale]).sort()).toEqual(
        Object.keys(uiCatalogs.en).sort(),
      );
      for (const [key, value] of Object.entries(workspaceCopy[locale])) {
        expect(value.trim(), key).not.toBe("");
        expect(value, key).not.toContain("\u2014");
        expect(fields(value), key).toEqual(fields(key));
      }
      for (const reason of [
        "account_paused",
        "payment_required",
        "daily_limit",
        "monthly_limit",
        "free_lifetime_limit",
      ]) {
        const policy = getMobilePaywall(
          { canGenerate: false, blockedReason: reason, plan: { tier: "pro" } },
          undefined,
          locale,
        )!;
        if (locale !== "en") {
          const english = getMobilePaywall(
            {
              canGenerate: false,
              blockedReason: reason,
              plan: { tier: "pro" },
            },
            undefined,
            "en",
          )!;
          expect(policy.title).not.toBe(english.title);
          expect(policy.message).not.toBe(english.message);
          expect(policy.trust).not.toBe(english.trust);
        }
      }
    },
  );
  it("interpolates opaque user content after translation without rewriting it", () => {
    const title = "Add item <img src=x> Your drafts";
    expect(uiFormat("Settings for {0}", [title], "nl")).toBe(
      "Instellingen: " + title,
    );
    expect(uiFormat("Item {0}", [3], "cs-CZ")).toBe("Položka 3");
    expect(uiText("My own seller note", "fr")).toBe("My own seller note");
  });
  it("localizes provider errors without displaying unrecognized English diagnostics", () => {
    vi.stubGlobal("navigator", { languages: ["fr"], language: "fr" });
    expect(uiError("Unknown upstream internal failure")).toBe(
      "Une erreur est survenue. Réessayez.",
    );
    expect(uiError("Impossible d’enregistrer les réglages. Réessayez.")).toBe(
      "Impossible d’enregistrer les réglages. Réessayez.",
    );
  });
});
