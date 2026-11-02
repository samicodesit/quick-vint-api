import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { uiCatalogs } from "../ui";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");
const brands = new Set([
  "AutoLister",
  "AutoLister AI",
  "Starter",
  "Pro",
  "Business",
  "Maje",
]);
const check = (value: string) =>
  /^[A-Za-z]/.test(value) &&
  !brands.has(value) &&
  !/[{}<>]|^https?:|^javascript:/.test(value);

describe("web app localization coverage", () => {
  it("localizes standalone uploader errors while retaining translated progress messages", () => {
    const context: any = {
      AutoListerWebUiCatalogs: uiCatalogs,
      navigator: { languages: ["nl"], language: "nl" },
      document: {
        documentElement: { lang: "en" },
        createTreeWalker: () => ({ nextNode: () => null }),
        querySelectorAll: () => [],
      },
    };
    runInNewContext(read("public/web-app-ui-runtime.js"), context);
    expect(context.AutoListerWebUi.error("Unknown server diagnostic")).toBe(
      "Er ging iets mis. Probeer het opnieuw.",
    );
    const progress = context.AutoListerWebUi.format(
      "{0} photos ready on your computer",
      [5],
    );
    expect(context.AutoListerWebUi.error(progress)).toBe(
      "Naar computer verstuurd: 5",
    );
  });
  it("covers static shell and lazy-dialog text plus accessible names", () => {
    const files = readdirSync(join(root, "src/components/mobile-web"))
      .filter((file) => file.endsWith(".astro"))
      .map((file) => "src/components/mobile-web/" + file);
    files.push(
      "src/pages/app/chatgpt.astro",
      "src/pages/app/auth/callback.astro",
      "src/pages/phone-upload.html",
    );
    const gaps: string[] = [];
    for (const file of files) {
      const source = read(file)
        .replace(/^---[\s\S]*?---/, "")
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "");
      const values = [...source.matchAll(/>([^<>]+)</g)].map((match) =>
        match[1].trim(),
      );
      values.push(
        ...[
          ...source.matchAll(
            /\s(?:aria-label|aria-valuetext|placeholder|alt|label)="([^"]+)"/g,
          ),
        ].map((match) => match[1]),
      );
      for (const value of values)
        if (
          check(value) &&
          !(value in uiCatalogs.en) &&
          value !== "you@example.com"
        )
          gaps.push(`${file}: ${value}`);
    }
    for (const file of [
      "paywall.ts",
      "photoEditor.ts",
      "extensionSuggestion.ts",
    ]) {
      const code = read("src/app/mobile-web/" + file);
      const chunks: string[] = [];
      const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (
          ts.isBinaryExpression(node) &&
          ts.isPropertyAccessExpression(node.left) &&
          node.left.name.text === "innerHTML"
        ) {
          const value = node.right;
          if (ts.isTemplateExpression(value))
            chunks.push(
              value.head.text +
                value.templateSpans
                  .map((span) => "{expression}" + span.literal.text)
                  .join(""),
            );
          else if (
            ts.isStringLiteral(value) ||
            ts.isNoSubstitutionTemplateLiteral(value)
          )
            chunks.push(value.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
      const source = chunks.join("\n");
      for (const match of source.matchAll(/>([^<>]+)</g)) {
        const value = match[1].trim();
        if (check(value) && !(value in uiCatalogs.en))
          gaps.push(`${file}: ${value}`);
      }
      for (const match of source.matchAll(
        /(?:aria-label|aria-valuetext|placeholder|alt)="([^"]+)"/g,
      )) {
        if (check(match[1]) && !(match[1] in uiCatalogs.en))
          gaps.push(`${file}: ${match[1]}`);
      }
    }
    expect([...new Set(gaps)]).toEqual([]);
  });
  it.each(["cs", "cz", "cs-CZ"])(
    "resolves %s model-photo messages without English fallback",
    (language) => {
      const context: any = {
        AutoListerModelCopy: { getLocale: () => language },
      };
      runInNewContext(read("public/listing-model-photos.js"), context);
      expect(
        context.AutoListerPhotoUI.text("Text ready · Model photos pending"),
      ).toBe("Text hotový · Fotky modelu se připravují");
    },
  );
});
