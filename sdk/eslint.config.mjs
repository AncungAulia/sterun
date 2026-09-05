import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
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
);
