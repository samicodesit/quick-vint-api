// eslint.config.cjs

const { FlatCompat } = require("@eslint/eslintrc");
const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const importPlugin = require("eslint-plugin-import");

const compat = new FlatCompat({});

module.exports = [
  // 1) Ignore build folders
  {
    ignores: ["node_modules/**", "dist/**", ".vercel/**"],
  },

  // 2) Base JS recommended rules
  js.configs.recommended,

  // 3) Common globals for all linted files (Node.js runtime)
  {
    files: ["**/*.{ts,js}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        // Node.js built-in globals (available in Node 18+)
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
  },

  // 4) TypeScript-specific: parser, plugins, rules
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // allow `any` for now
      "@typescript-eslint/no-explicit-any": "off",
      // don't force every export's return type
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // Disable base rule - @typescript-eslint/no-unused-vars is the TS-aware replacement
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // 5) Import ordering
  {
    plugins: { import: importPlugin },
    rules: {
      "import/order": ["warn", { groups: ["builtin", "external", "internal"] }],
    },
  },

  // 6) Browser globals for client-side utilities
  {
    files: ["utils/vintedCountryDetector.js", "utils/vintedRedirect.ts"],
    languageOptions: {
      globals: {
        navigator: "readonly",
        window: "readonly",
        document: "readonly",
      },
    },
  },

  // 7) Prettier integration
  ...compat.extends("plugin:prettier/recommended"),
];
