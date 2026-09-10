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
};

export default nextConfig;
