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
   * The pass's service worker (STE-21 round 2).
   *
   * A cached service worker is a bug that outlives the deploy that caused it:
   * the browser would keep serving the old one, and with it an old cache, on a
   * screen somebody is holding up at a desk. `Service-Worker-Allowed` is what
   * lets a file served from the origin root claim the narrower `/pass` scope.
   */
  async headers() {
    return [
      {
        source: "/pass-sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/pass" },
        ],
      },
    ];
  },
};

export default nextConfig;
