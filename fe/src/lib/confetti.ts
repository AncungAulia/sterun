/**
 * The celebration burst, fired on the two screens that mean "it worked": the
 * wizard's Done step (`/org/new`) and the entry flow's success page (STE-21).
 *
 * One function rather than a copy per screen, because Ancung asked for the
 * entry flow's confetti to be exactly the wizard's, and two copies would drift
 * the first time one of them was tuned.
 *
 * Behind `prefers-reduced-motion`, because a full-screen burst is exactly the
 * animation that setting exists to refuse. canvas-confetti draws on a canvas
 * that ignores pointer events, so it cannot eat a click on the page underneath.
 *
 * The caller guards against firing twice (a ref, since Strict Mode mounts
 * effects twice in development). This function only fires.
 */

/**
 * The confetti colours, taken from the same custom properties the rest of the
 * app paints with, so a change to Nabil's palette carries here too and no hex
 * value is written down twice. Returns an empty list where the properties do
 * not resolve, which the caller turns into "say nothing about colour".
 */
function tealRamp(): string[] {
  const style = getComputedStyle(document.documentElement);
  return ["--color-teal-500", "--color-teal-400", "--color-teal-300", "--color-teal-200"]
    .map((name) => style.getPropertyValue(name).trim())
    .filter((value) => value.length > 0);
}

export function fireConfetti(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /*
   * No cancellation, deliberately. The first version cancelled the burst on
   * unmount, which in Strict Mode meant it never fired at all: the effect ran
   * and started the import, the cleanup cancelled it, and the second run hit
   * the caller's ref guard and returned. Two mounts, zero confetti, and nothing
   * in the console to say so. The burst is fire and forget, since
   * canvas-confetti removes its own canvas when the animation ends.
   *
   * Imported here rather than at the top so the library stays out of the
   * bundle until a screen actually celebrates.
   */
  void import("canvas-confetti")
    .then(({ default: confetti }) => {
      /*
       * Omitted rather than passed empty when the ramp comes back with
       * nothing: `colors: []` is not "use your defaults" to canvas-confetti,
       * it is a list to pick from, and picking from an empty list throws on
       * the first frame. Anywhere the custom properties do not resolve, this
       * falls back to the library's own palette instead of to a crash.
       */
      const teal = tealRamp();
      const palette = teal.length > 0 ? { colors: teal } : {};
      confetti({ particleCount: 70, spread: 62, origin: { y: 0.7 }, ...palette });
      window.setTimeout(() => {
        try {
          confetti({ particleCount: 40, spread: 90, origin: { y: 0.65 }, ...palette });
        } catch {
          // Same reasoning as the catch below, for the burst that runs later.
        }
      }, 220);
    })
    // Swallowed on purpose. This is decoration on a screen that tells somebody
    // their race is live or their entry went through; a canvas that will not
    // paint, or a chunk that will not load, must never be what they see instead.
    .catch(() => {});
}
