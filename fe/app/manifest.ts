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
 * The icons say the size they really are, and both PNGs are rendered from
 * `public/brand/logo/sterun-logo-black.svg` rather than upscaled from the
 * 256px `app/icon.png`: 192 and 512 are the two sizes Android asks for, and
 * 512 is what a splash screen is drawn from.
 *
 * They are `maskable` as well as `any`. Android crops an icon to whatever
 * shape the launcher uses, a circle on most phones, so the mark is laid out at
 * 62% of the canvas on a full bleed of `paper`: the crop can only ever eat
 * background. Declared without that, the launcher adds its own white plate
 * behind the icon and the mark ends up a stamp inside a stamp.
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
      { src: "/icons/sterun-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/sterun-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/sterun-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/sterun-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/logo/sterun-logo-black.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
