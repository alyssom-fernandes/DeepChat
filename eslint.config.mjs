import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "docs/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }], // catch vazio é intencional (storage best-effort)
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["js/boot.js"],
    languageOptions: { sourceType: "script" },
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
];
