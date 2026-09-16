import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Dev only. A phone cannot reach localhost, so wallet pairing on a real
   * device goes through an ngrok tunnel, and Next blocks its dev resources
   * (HMR included) for any origin not listed here. One exact host, not
   * `*.ngrok-free.dev`: the wildcard would open the dev server to everyone's
   * tunnels. Add your own static domain next to it if you have one.
   */
  allowedDevOrigins: ["tendentiously-impalpable-dede.ngrok-free.dev"],

  /**
   * The offline worker for the pass and the desk (STE-21 round 2, STE-22).
   *
   * A cached service worker is a bug that outlives the deploy that caused it:
   * the browser would keep serving the old one, and with it an old cache, on a
   * screen somebody is holding up at a desk. Hence no-store.
   *
   * No `Service-Worker-Allowed`. An earlier version sent one, with a comment
   * saying it was what let this file claim `/pass`. It was not: a worker's
   * maximum scope defaults to its script's own directory, which for a file at
   * the origin root is already `/`. The header only matters for a scope above
   * the script, and the narrow scope is set where the worker is registered
   * (`components/layout/OfflineReady.tsx`).
   */
  async headers() {
    return [
      {
        source: "/offline-sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
