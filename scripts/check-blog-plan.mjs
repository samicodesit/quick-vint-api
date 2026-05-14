#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PLAN_PATH = path.join(ROOT, "docs", "blog-content-plan.md");
const BLOG_DIR = path.join(ROOT, "src", "content", "blog");
const ALLOWED_LOCALES = new Set(["en", "fr", "de", "nl"]);
const LOCALE_COLUMNS = ["en", "fr", "de", "nl"];
const ALLOWED_STATUSES = new Set(["[ ]", "[~]", "[x]", ""]);
const APPROVED_PRODUCT_PLACEMENTS = new Set([
  "none",
  "ProductMention",
  "PhotoToListingCTA",
  "WritingStyleCTA",
  "EndOfPostCTA",
]);

const errors = [];
const warnings = [];

function splitMarkdownRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index];
    const separatorLine = lines[index + 1];
    if (!headerLine.trim().startsWith("|") || !separatorLine.trim().startsWith("|")) {
      continue;
    }

    const headers = splitMarkdownRow(headerLine);
    const separator = splitMarkdownRow(separatorLine);
    const isSeparator = separator.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (!isSeparator) {
      continue;
    }

    const rows = [];
    let rowIndex = index + 2;
    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const cells = splitMarkdownRow(lines[rowIndex]);
      const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""]));
      rows.push({ line: rowIndex + 1, row });
      rowIndex += 1;
    }

    tables.push({ headers, rows });
    index = rowIndex;
  }

  return tables;
}

function parseFrontmatter(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`${filePath}: missing frontmatter`);
    return null;
  }

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const simpleField = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!simpleField) {
      continue;
    }

    const [, key, rawValue] = simpleField;
    const trimmed = rawValue.trim();
    if (trimmed === "") {
      continue;
    }

    data[key] = trimmed.replace(/^["']|["']$/g, "");
  }

  return data;
}

async function listMdxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMdxFiles(entryPath)));
    } else if (/\.mdx?$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function getPublishedPosts() {
  const files = await listMdxFiles(BLOG_DIR);
  const posts = new Map();

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const data = parseFrontmatter(source, path.relative(ROOT, file));
    if (!data || data.draft === "true") {
      continue;
    }

    const locale = data.locale || path.relative(BLOG_DIR, file).split(path.sep)[0];
    const translationKey = data.translationKey;
    if (!translationKey) {
      errors.push(`${path.relative(ROOT, file)}: missing translationKey`);
      continue;
    }

    if (!ALLOWED_LOCALES.has(locale)) {
      errors.push(`${path.relative(ROOT, file)}: unsupported locale "${locale}"`);
      continue;
    }

    posts.set(`${translationKey}:${locale}`, {
      translationKey,
      locale,
      file: path.relative(ROOT, file),
    });
  }

  return posts;
}

async function main() {
  const [planMarkdown, publishedPosts] = await Promise.all([
    readFile(PLAN_PATH, "utf8"),
    getPublishedPosts(),
  ]);

  const tables = parseMarkdownTables(planMarkdown);
  const tracker = tables.find((table) =>
    ["Translation key", "Product placement", ...LOCALE_COLUMNS].every((header) =>
      table.headers.includes(header),
    ),
  );

  if (!tracker) {
    errors.push("docs/blog-content-plan.md: missing localization matrix table with required columns");
  } else {
    for (const locale of LOCALE_COLUMNS) {
      if (!ALLOWED_LOCALES.has(locale)) {
        errors.push(`docs/blog-content-plan.md: unsupported locale column "${locale}"`);
      }
    }

    const trackedKeys = new Set();

    for (const { line, row } of tracker.rows) {
      const translationKey = row["Translation key"];
      const placement = row["Product placement"];
      if (!translationKey) {
        errors.push(`docs/blog-content-plan.md:${line}: missing Translation key`);
        continue;
      }

      trackedKeys.add(translationKey);

      if (!APPROVED_PRODUCT_PLACEMENTS.has(placement)) {
        errors.push(
          `docs/blog-content-plan.md:${line}: invalid Product placement "${placement}"`,
        );
      }

      for (const locale of LOCALE_COLUMNS) {
        const status = row[locale];
        if (!ALLOWED_STATUSES.has(status)) {
          errors.push(`docs/blog-content-plan.md:${line}: invalid ${locale} status "${status}"`);
        }

        if (status === "[x]" && !publishedPosts.has(`${translationKey}:${locale}`)) {
          errors.push(
            `docs/blog-content-plan.md:${line}: ${locale} is [x] but no matching non-draft post exists for translationKey "${translationKey}"`,
          );
        }
      }
    }

    for (const post of publishedPosts.values()) {
      if (!trackedKeys.has(post.translationKey)) {
        warnings.push(
          `${post.file}: published post translationKey "${post.translationKey}" is missing from docs/blog-content-plan.md`,
        );
      }
    }
  }

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`Error: ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Blog plan check passed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

