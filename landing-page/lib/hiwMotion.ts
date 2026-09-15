/**
 * Motion model for the How it works track, measured from akaru.fr.
 *
 * Their home page was sampled in headless Chrome at 1440x900, every 50px of
 * scroll, reading the transform of every moving element, and each curve below
 * is the fit to those samples (errors in the comments). Nothing here is tuned
 * by eye.
 *
 * Units: lengths are fractions of the box width unless named otherwise, and p
 * is progress through the track's scroll, 0 to 1.
 */

/** Every step panel is two thirds of the box. akaru: 959px of 1440. */
export const PANEL_WIDTH = 0.666;

/**
 * akaru opens on a 50%-wide intro and the first project sits behind it at 50%.
 * Enter takes the intro's place, so it starts shifted left by the difference
 * and every panel after it lands exactly where akaru's projects rest: 50%,
 * 85.6% and 96.2%.
 */
export const LEAD_OFFSET = 0.5 - PANEL_WIDTH;

/**
 * Scroll length of the track per pixel of box height. akaru runs the track over
 * 3450px of scroll at 900px tall, and the length follows the height: at 700px
 * tall the same travel took 2777px.
 */
export const SCROLL_PER_BOX_HEIGHT = 3450 / 900;

/**
 * Where the coal and runway wipes hand over to the pour: the coal row's top at
 * this fraction of the screen's height. The pour then runs until the section
 * reaches the top of the screen. The layered wipe that opens the box starts
 * halfway through the pour and ends as the box reaches the top, so the steps
 * are already showing while the heading is still on screen.
 */
export const HANDOVER_SCREEN = 0.4;

type QueueStep = {
  /** Window scale while waiting. */
  scale0: number;
  /** How far the window sits below its place while waiting, as a fraction of its height. */
  drop0: number;
  /** Ease-out power of the opening. */
  power: number;
  /** Fraction of the track's scroll the opening takes. */
  span: number;
  /** Pull toward the right edge while waiting, in box widths. Released by the panel before. */
  pull0: number;
  /** The title, meta and button play in once the panel's left edge is left of this. */
  revealAt: number;
};

/**
 * The three panels queued behind Enter.
 *
 * Opening, as e = 1 - (1 - p / span)^power:
 *   power 2 over 600px, power 3 over 1700px, power 4 over 3450px
 *   (rms error 0.0026, 0.0027, 0.0004).
 * Window: scale0 + (1 - scale0) * e, dropped drop0 * (1 - e), picture 2 - scale.
 * Pull: pull0 * (1 - e of the panel before), worst error 1.1px.
 * The drop was 50, 250 and 350px on a 539px window.
 */
export const QUEUE: readonly QueueStep[] = [
  { scale0: 0.6, drop0: 50 / 539, power: 2, span: 600 / 3450, pull0: 0, revealAt: 0.319 },
  { scale0: 0.4, drop0: 250 / 539, power: 3, span: 1700 / 3450, pull0: -0.31, revealAt: 0.436 },
  { scale0: 0.2, drop0: 350 / 539, power: 4, span: 1, pull0: -0.87, revealAt: 0.457 },
];

/** How far the track travels: until the last panel reaches the left edge. akaru: 2638px, 1.832 widths. */
export const TRAVEL = -(LEAD_OFFSET + PANEL_WIDTH * QUEUE.length);

/** Track position. Quadratic ease-out (rms error 0.6px against the samples). */
export function trackX(p: number): number {
  return LEAD_OFFSET + TRAVEL * (1 - (1 - p) ** 2);
}

function opening(k: number, p: number): number {
  const step = QUEUE[k];
  const u = Math.min(1, Math.max(0, p / step.span));
  return 1 - (1 - u) ** step.power;
}

export type PanelFrame = {
  /** Left edge on screen, in box widths, after the pull. */
  left: number;
  /** Extra translateX from the queue, in box widths. */
  pull: number;
  scale: number;
  /** Window drop, as a fraction of the window's height. */
  drop: number;
  revealed: boolean;
};

export function panelFrame(i: number, p: number, x: number = trackX(p)): PanelFrame {
  const natural = x + PANEL_WIDTH * i;
  const step = QUEUE[i - 1];
  if (!step) return { left: natural, pull: 0, scale: 1, drop: 0, revealed: true };
  const e = opening(i - 1, p);
  const before = i === 1 ? 1 : opening(i - 2, p);
  const pull = step.pull0 * (1 - before);
  const left = natural + pull;
  return {
    left,
    pull,
    scale: step.scale0 + (1 - step.scale0) * e,
    drop: step.drop0 * (1 - e),
    revealed: left < step.revealAt,
  };
}
