import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // A float in money code is a bug waiting to happen: sUSD amounts are
      // i128 stroops and stay strings or bigints all the way through.
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
