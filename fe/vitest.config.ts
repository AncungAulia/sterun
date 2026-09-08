import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * No @vitejs/plugin-react here on purpose: its current major requires Vite 8
 * while Vitest 3 ships Vite 7, and the only thing the plugin adds over esbuild
 * is Fast Refresh, which tests never use. esbuild handles the JSX transform,
 * told which runtime to use by `jsx` below.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    restoreMocks: true,
    /**
     * lib/env.ts throws at import when configuration is missing, and almost
     * everything imports it transitively. These are the testnet values from
     * docs/deployments.md so a test does not have to stub them to render a
     * component; env.test.ts overrides them per case with vi.stubEnv.
     */
    env: {
      NEXT_PUBLIC_RPC_URL: "https://soroban-testnet.stellar.org",
      NEXT_PUBLIC_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      NEXT_PUBLIC_EVENT_REGISTRY: "CDL6A734H5DITOFC5VGSAAIOQBBGSH2NIIDU4KJDAO734I3ZRL4GTA64",
      NEXT_PUBLIC_RACE_RECORD: "CDWFNF427X4R5BABSUUQNPNEVP5QERBGLTHWD5GEHSGFK6E4YME7XNB4",
      NEXT_PUBLIC_SUSD_SAC: "CBQ6444FXNECVHSPECYHUO26V2HFLPAXXGOTWDA5F3RPGH6TD7RDMOOU",
    },
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
});
