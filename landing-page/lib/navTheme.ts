/**
 * Where the header should read as dark-on-light versus light-on-dark.
 *
 * The header is a horizontal band [0, navH] pinned to the top of the viewport.
 * Everything that can sit behind it is a full-width surface with a vertical
 * extent and a theme: page sections, and the menu overlay's sweeping panels.
 * Because every boundary between them is horizontal, the answer is a list of
 * vertical intervals inside the band, which is exactly what clip-path inset()
 * can express.
 */

export type Surface = {
  /** Viewport y of the top edge. */
  top: number;
  /** Viewport y of the bottom edge. */
  bottom: number;
  dark: boolean;
};

export type Band = { top: number; bottom: number };

/** Fully clipped away. Used for a layer that has nothing to show. */
export const HIDDEN = "inset(50% 0 50% 0)";

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/**
 * Paint surfaces over the band in order, later ones on top, and return the dark
 * intervals, top to bottom.
 *
 * Anything not covered by a surface counts as light, matching the rule that an
 * unmarked section is light. Adjacent dark intervals are merged, since two dark
 * surfaces touching read as one region.
 *
 * `max` is the number of dark layers available to show them. Two dark bands at
 * once happens when a light section shorter than the header sits between two
 * dark ones, or while the menu's panels sweep past a dark section. More than
 * `max` has no case in this page; if it ever happens the two nearest bands are
 * joined rather than dropping one.
 */
export function darkBands(navH: number, surfaces: Surface[], max = 2): Band[] {
  let segments: { top: number; bottom: number; dark: boolean }[] = [
    { top: 0, bottom: navH, dark: false },
  ];

  for (const surface of surfaces) {
    const top = Math.max(0, Math.min(navH, surface.top));
    const bottom = Math.max(0, Math.min(navH, surface.bottom));
    if (bottom <= top) continue;

    const next: typeof segments = [];
    for (const seg of segments) {
      if (seg.bottom <= top || seg.top >= bottom) {
        next.push(seg);
        continue;
      }
      if (seg.top < top) next.push({ top: seg.top, bottom: top, dark: seg.dark });
      next.push({
        top: Math.max(seg.top, top),
        bottom: Math.min(seg.bottom, bottom),
        dark: surface.dark,
      });
      if (seg.bottom > bottom) next.push({ top: bottom, bottom: seg.bottom, dark: seg.dark });
    }
    segments = next;
  }

  const bands: Band[] = [];
  for (const seg of segments) {
    if (!seg.dark) continue;
    const last = bands[bands.length - 1];
    if (last && Math.abs(last.bottom - seg.top) < 0.01) last.bottom = seg.bottom;
    else bands.push({ top: seg.top, bottom: seg.bottom });
  }

  while (bands.length > max) {
    let at = 0;
    let gap = Infinity;
    for (let i = 0; i < bands.length - 1; i++) {
      const g = bands[i + 1].top - bands[i].bottom;
      if (g < gap) {
        gap = g;
        at = i;
      }
    }
    bands.splice(at, 2, { top: bands[at].top, bottom: bands[at + 1].bottom });
  }

  return bands;
}

/** Clip for one light-on-dark layer: show only its band. */
export function bandClip(band: Band | undefined, navH: number): string {
  if (!band) return HIDDEN;
  if (band.top <= 0 && band.bottom >= navH) return "none";
  return `inset(${px(band.top)} 0 ${px(navH - band.bottom)} 0)`;
}

/**
 * Clip for the dark-on-light layer: everything except the dark bands.
 *
 * It has to be clipped too, not merely covered by the light layer on top.
 * The two layers draw identical glyphs in different colours at the same
 * positions, and a light glyph over a dark one leaves the dark one's
 * anti-aliased edge showing as a halo around every letter.
 *
 * A band with a hole in it is not an inset(), so it is an even-odd polygon:
 * the full rectangle, then one rectangle per band cut out of it.
 */
export function complementClip(bands: Band[], navH: number): string {
  if (bands.length === 0) return "none";
  const covered = bands.reduce((sum, b) => sum + (b.bottom - b.top), 0);
  if (covered >= navH - 0.01) return HIDDEN;

  const points = ["0 0", "100% 0", "100% 100%", "0 100%", "0 0"];
  for (const b of bands) {
    points.push(
      `0 ${px(b.top)}`,
      `0 ${px(b.bottom)}`,
      `100% ${px(b.bottom)}`,
      `100% ${px(b.top)}`,
      `0 ${px(b.top)}`,
    );
  }
  return `polygon(evenodd, ${points.join(", ")})`;
}
