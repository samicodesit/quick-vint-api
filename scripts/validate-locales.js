#!/usr/bin/env node

/**
 * Locale Validation Script
 * Ensures all translation files have consistent keys
 */

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "public", "locales");
const LANGUAGES = ["en", "fr", "de"];

function loadLocale(lang) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error loading ${lang}.json:`, error.message);
    process.exit(1);
  }
}

function getAllKeys(obj, prefix = "") {
  let keys = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      keys = keys.concat(getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

function validateLocales() {
  console.log("🔍 Validating locale files...\n");

  const locales = {};
  const allKeys = {};

  // Load all locales
  for (const lang of LANGUAGES) {
    locales[lang] = loadLocale(lang);
    allKeys[lang] = new Set(getAllKeys(locales[lang]));
    console.log(`✅ Loaded ${lang}.json (${allKeys[lang].size} keys)`);
  }

  console.log("\n📊 Comparing translation keys...\n");

  // Use English as the reference
  const referenceKeys = allKeys["en"];
  let hasErrors = false;

  for (const lang of LANGUAGES) {
    if (lang === "en") continue;

    const langKeys = allKeys[lang];
    const missing = [...referenceKeys].filter((key) => !langKeys.has(key));
    const extra = [...langKeys].filter((key) => !referenceKeys.has(key));

    if (missing.length > 0) {
      console.log(`❌ ${lang.toUpperCase()}: Missing ${missing.length} keys:`);
      missing.forEach((key) => console.log(`   - ${key}`));
      console.log();
      hasErrors = true;
    }

    if (extra.length > 0) {
      console.log(
        `⚠️  ${lang.toUpperCase()}: ${extra.length} extra keys (not in English):`,
      );
      extra.forEach((key) => console.log(`   - ${key}`));
      console.log();
    }

    if (missing.length === 0 && extra.length === 0) {
      console.log(`✅ ${lang.toUpperCase()}: All keys match English`);
    }
  }

  if (hasErrors) {
    console.log("\n❌ Validation failed! Please fix missing translations.\n");
    process.exit(1);
  }

  console.log("\n✅ All locale files are valid and synchronized!\n");
}

// Run validation
validateLocales();
