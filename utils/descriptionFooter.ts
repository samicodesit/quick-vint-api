export const DESCRIPTION_FOOTER_MAX_LENGTH = 240;

const URL_PATTERN =
  /\b(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|co|io|app|fr|de|nl|it|es|pl|pt|be|uk|co\.uk)\b)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+|00)?\d[\d\s().-]{7,}\d/;

export type DescriptionFooterValidation =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function validateDescriptionFooterText(
  value: unknown,
): DescriptionFooterValidation {
  if (value === undefined || value === null || value === "") {
    return { ok: true, text: "" };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "Saved note must be plain text." };
  }

  if (value.length > DESCRIPTION_FOOTER_MAX_LENGTH) {
    return {
      ok: false,
      error: `Saved note must be ${DESCRIPTION_FOOTER_MAX_LENGTH} characters or less.`,
    };
  }

  if (
    URL_PATTERN.test(value) ||
    EMAIL_PATTERN.test(value) ||
    PHONE_PATTERN.test(value)
  ) {
    return {
      ok: false,
      error:
        "Saved note cannot include links, email addresses, or phone numbers.",
    };
  }

  return { ok: true, text: value };
}

function isHashtagLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#")) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => token.startsWith("#"));
}

function trimTrailingBlankLines(lines: string[]) {
  const copy = [...lines];
  while (copy.length > 0 && copy[copy.length - 1]?.trim() === "") {
    copy.pop();
  }
  return copy;
}

export function appendDescriptionFooter(
  description: string,
  footerText: string,
) {
  if (!footerText || !/\S/.test(footerText)) return description;
  if (description.includes(footerText)) return description;

  const lines = description.split("\n");
  let lastContentIndex = lines.length - 1;

  while (lastContentIndex >= 0 && lines[lastContentIndex]?.trim() === "") {
    lastContentIndex -= 1;
  }

  let firstHashtagIndex = lastContentIndex;
  while (
    firstHashtagIndex >= 0 &&
    isHashtagLine(lines[firstHashtagIndex] || "")
  ) {
    firstHashtagIndex -= 1;
  }

  const hasTrailingHashtags = firstHashtagIndex < lastContentIndex;
  if (!hasTrailingHashtags) {
    return `${description}\n\n${footerText}`;
  }

  const beforeHashtags = trimTrailingBlankLines(
    lines.slice(0, firstHashtagIndex + 1),
  ).join("\n");
  const hashtagBlock = lines.slice(firstHashtagIndex + 1).join("\n");

  return `${beforeHashtags}\n\n${footerText}\n\n${hashtagBlock}`;
}

export function canUseDescriptionFooter(
  effectiveTier: string | null | undefined,
) {
  return (
    effectiveTier === "free" ||
    effectiveTier === "pro" ||
    effectiveTier === "business"
  );
}

export function redactDescriptionFooterFromBody(body: any) {
  if (!body || typeof body !== "object") return body;

  const redacted = { ...body };

  if (Array.isArray(redacted.imageUrls)) {
    redacted.imageCount = redacted.imageUrls.length;
    redacted.imageUrlKinds = redacted.imageUrls.map((url: unknown) => {
      const value = String(url || "");
      if (/^data:/i.test(value)) return "data_url";
      if (/^blob:/i.test(value)) return "blob_url";
      if (/^https?:\/\//i.test(value)) return "remote_url";
      return "unknown";
    });
    delete redacted.imageUrls;
  }

  if (Object.prototype.hasOwnProperty.call(redacted, "descriptionFooterText")) {
    const rawValue = redacted.descriptionFooterText;
    const stringValue = typeof rawValue === "string" ? rawValue : "";
    redacted.hasDescriptionFooter = /\S/.test(stringValue);
    redacted.descriptionFooterLength = stringValue.length;
    delete redacted.descriptionFooterText;
  }

  return redacted;
}
