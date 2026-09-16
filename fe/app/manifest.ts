import type { MetadataRoute } from "next";

/**
 * So a runner can keep the pass on their home screen (STE-21, round 2).
 *
 * `start_url` is the directory rather than a pass: a manifest is one file for
 * the whole origin and cannot know a token id. The installed app opens at the
 * races, and the pass is one tap from the race a runner entered.
 *
 * The two colours are the only hex values in this app outside `tokens.css`,
 * because an operating system reads this file before any stylesheet exists.
 * They are `--color-paper` and `--color-teal`; if those change, change these in
 * the same commit.
 *
 * The icons say the size they really are. `app/icon.png` is 256px, which is
 * enough for Chrome to offer an install, and the lockup is there as the
 * scalable one. A 512px export would make a better splash screen, and that is
 * Nabil's to draw rather than ours to upscale.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sterun",
    short_name: "Sterun",
    description: "Find races, enter them, and keep a trusted record of every finish.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#016985",
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
      { src: "/brand/logo/sterun-logo-black.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
