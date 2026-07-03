import { describe, expect, it } from "vitest";

import {
  DESCRIPTION_FOOTER_MAX_LENGTH,
  appendDescriptionFooter,
  canUseDescriptionFooter,
  redactDescriptionFooterFromBody,
  validateDescriptionFooterText,
} from "../../../utils/descriptionFooter.js";

describe("description footer helpers", () => {
  it("preserves saved note whitespace when inserting before trailing hashtags", () => {
    const footerText = "  Smoke-free home.\n\nShips fast.  ";

    expect(
      appendDescriptionFooter("Great condition.\n\n#vinted #dress", footerText),
    ).toBe("Great condition.\n\n  Smoke-free home.\n\nShips fast.  \n\n#vinted #dress");
  });

  it("appends the saved note when there is no trailing hashtag block", () => {
    expect(
      appendDescriptionFooter("Great condition.", "Bundle discounts available."),
    ).toBe("Great condition.\n\nBundle discounts available.");
  });

  it("does not duplicate an exact saved note that is already present", () => {
    const description =
      "Great condition.\n\n  Smoke-free home.\n\nShips fast.  \n\n#vinted";
    const footerText = "  Smoke-free home.\n\nShips fast.  ";

    expect(appendDescriptionFooter(description, footerText)).toBe(description);
  });

  it("keeps validated text exactly as typed", () => {
    const footerText = "  Line one.\n\nLine two.  ";

    expect(validateDescriptionFooterText(footerText)).toEqual({
      ok: true,
      text: footerText,
    });
  });

  it("rejects links, email addresses, phone numbers, and overly long text", () => {
    expect(validateDescriptionFooterText("See www.example.com")).toMatchObject({
      ok: false,
    });
    expect(validateDescriptionFooterText("Email me test@example.com")).toMatchObject({
      ok: false,
    });
    expect(validateDescriptionFooterText("Text +31612345678")).toMatchObject({
      ok: false,
    });
    expect(
      validateDescriptionFooterText("a".repeat(DESCRIPTION_FOOTER_MAX_LENGTH + 1)),
    ).toMatchObject({ ok: false });
  });

  it("allows the feature for free, pro, and business only", () => {
    expect(canUseDescriptionFooter("free")).toBe(true);
    expect(canUseDescriptionFooter("pro")).toBe(true);
    expect(canUseDescriptionFooter("business")).toBe(true);
    expect(canUseDescriptionFooter("starter")).toBe(false);
    expect(canUseDescriptionFooter(null)).toBe(false);
  });

  it("redacts saved note text from logged request bodies", () => {
    expect(
      redactDescriptionFooterFromBody({
        titleLanguageCode: "en",
        descriptionFooterText: "  Smoke-free home.\n\nShips fast.  ",
      }),
    ).toEqual({
      titleLanguageCode: "en",
      hasDescriptionFooter: true,
      descriptionFooterLength: 33,
    });
  });
});
