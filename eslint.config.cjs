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

  // 3) TypeScript support + globals for Node
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // allow `any` for now
      "@typescript-eslint/no-explicit-any": "off",
      // don’t force every export’s return type
      "@typescript-eslint/explicit-module-boundary-types": "off",
      // but still catch truly unused vars
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },

  // 4) Import ordering (optional, but helpful)
  {
    plugins: { import: importPlugin },
    rules: {
      "import/order": ["warn", { groups: ["builtin", "external", "internal"] }],
    },
  },

  // 5) Prettier integration
  ...compat.extends("plugin:prettier/recommended"),
];
