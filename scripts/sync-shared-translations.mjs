import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const args = process.argv.slice(2);
const known = new Set(["--check", "--source-root", "--extension-root"]);
for (let index = 0; index < args.length; index++) {
  if (!known.has(args[index])) throw Error("Unknown option: " + args[index]);
  if (
    args[index] !== "--check" &&
    (!args[++index] || args[index].startsWith("--"))
  )
    throw Error("A directory is required for " + args[index - 1]);
}
const option = (name) =>
  args.includes(name) ? resolve(args[args.indexOf(name) + 1]) : null;
const root =
  option("--source-root") ||
  resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extension =
  option("--extension-root") ||
  (process.env.AUTOLISTER_TRANSLATIONS_EXTENSION_ROOT
    ? resolve(process.env.AUTOLISTER_TRANSLATIONS_EXTENSION_ROOT)
    : null);
if (extension) {
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(resolve(extension, "manifest.json"), "utf8"),
    );
  } catch {
    throw Error("Expected an extension manifest in " + extension);
  }
  if (
    manifest.manifest_version !== 3 ||
    !manifest.content_scripts?.some((entry) => entry.js?.includes("content.js"))
  )
    throw Error("Expected an AutoLister extension manifest in " + extension);
  const scripts = manifest.content_scripts.find((entry) =>
    entry.js?.includes("content.js"),
  ).js;
  const runtime = scripts.indexOf("lib/shared-ui-copy.js");
  if (
    runtime < 0 ||
    ["lib/billing-catalog.js", "lib/user-model-copy.js", "content.js"].some(
      (consumer) => scripts.indexOf(consumer) <= runtime,
    )
  )
    throw Error(
      "Integrate the shared translation runtime before syncing this extension checkout.",
    );
}
const common = JSON.parse(
  readFileSync(resolve(root, "src/data/sharedUiCopy.json"), "utf8"),
);
const billing = JSON.parse(
  readFileSync(resolve(root, "src/data/billingCopy.json"), "utf8"),
);
const locales = [
  "en",
  "fr",
  "cz",
  "da",
  "nl",
  "de",
  "el",
  "hr",
  "fi",
  "hu",
  "it",
  "lt",
  "pl",
  "pt",
  "ro",
  "es",
  "sk",
  "sv",
];
const sameKeys = (a, b) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const slots = (text) =>
  [...text.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((match) => match[0]).sort();
function validateMessage(key, translations) {
  if (!translations || !sameKeys(Object.keys(translations), locales))
    throw Error("Incomplete locales for " + key);
  for (const locale of locales) {
    const value = translations[locale];
    if (typeof value !== "string" || !value.trim() || value.includes("\u2014"))
      throw Error("Invalid translation for " + key + ":" + locale);
    if (!sameKeys(slots(value), slots(translations.en)))
      throw Error("Changed placeholders for " + key + ":" + locale);
  }
}
if (
  common.schemaVersion !== 1 ||
  !common.messages ||
  !Object.keys(common.messages).length
)
  throw Error("Unsupported shared translation schema");
for (const [key, translations] of Object.entries(common.messages))
  validateMessage(key, translations);
if (!sameKeys(Object.keys(billing), locales))
  throw Error("Incomplete billing locales");
for (const locale of locales)
  if (!sameKeys(Object.keys(billing[locale]), Object.keys(billing.en)))
    throw Error("Incomplete billing keys: " + locale);
for (const key of Object.keys(billing.en))
  validateMessage(
    "billing." + key,
    Object.fromEntries(locales.map((locale) => [locale, billing[locale][key]])),
  );

const modelCopy = readFileSync(
  resolve(root, "public/user-model-copy.js"),
  "utf8",
);
const modelCopyHash = createHash("sha256").update(modelCopy).digest("hex");
const data = {
  schemaVersion: 1,
  messages: common.messages,
  billing,
  componentHashes: { userModelCopy: modelCopyHash },
};
const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
const code = await format(
  `// Generated from quick-vint-api/src/data/sharedUiCopy.json and billingCopy.json.
// Includes the canonical public/user-model-copy.js component hash.
// Edit the canonical catalogs, then run translations:sync. Do not edit this bundle.
(function (root) {
  "use strict";
  const data = ${JSON.stringify(data)};
  const sourceHash = ${JSON.stringify(hash)};
  function normalizeLocale(language) {
    const value = String(language || "en").toLowerCase().split(/[-_]/)[0];
    const code = value === "cs" ? "cz" : value;
    return Object.hasOwn(data.billing, code) ? code : "en";
  }
  function get(id, language = "en") {
    const message = data.messages[id];
    if (!message) throw Error("Unknown shared UI message: " + id);
    return message[normalizeLocale(language)];
  }
  function project(bindings, language) {
    return Object.fromEntries(Object.entries(bindings).map(([key, id]) => [key, get(id, language)]));
  }
  const api = { data, sourceHash, billing: data.billing, normalizeLocale, get, project };
  root.AutoListerSharedUiCopy = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
`,
  { parser: "babel" },
);
// Validate everything before writing either consumer. A failed check never mutates files.
const targets = [[resolve(root, "public/shared-ui-copy.js"), code]];
if (extension)
  targets.push(
    [resolve(extension, "lib/shared-ui-copy.js"), code],
    [resolve(extension, "lib/user-model-copy.js"), modelCopy],
  );
let stale = false;
for (const [file, expected] of targets) {
  let current;
  try {
    current = readFileSync(file, "utf8");
  } catch {
    current = null;
  }
  if (current === expected) continue;
  if (args.includes("--check")) {
    console.error("Stale shared translations: " + file);
    stale = true;
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, expected);
    console.log("Updated " + file);
  }
}
if (stale) process.exitCode = 1;
else console.log("Shared translations synchronized: " + hash.slice(0, 12));
