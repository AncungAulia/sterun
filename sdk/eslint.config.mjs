import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // vendor/ is generator output, byte-identical to sc/bindings/*/src/index.ts
  // (test/vendor.test.ts proves it). Linting it would report 45 style problems
  // in code nobody is allowed to edit — and "fixing" them would break the very
  // property that makes the copy trustworthy.
  { ignores: ["dist/**", "vendor/**", "vendor-dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Same rule as be/: an entry fee is i128 stroops, and a float round-trip
      // of 0.1 sUSD is off by a stroop — which makes `enter` fail with no
      // explanation the caller can act on.
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "sUSD amounts are integer stroops — use BigInt." },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Build scripts run under Node, not in the library's environment.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
  },
);
