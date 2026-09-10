const VIDEO_SRC = "/videos/20260908_230806_1.mp4";

/**
 * STE-12 hero. Copy is fixed by docs/landing-copy.md; changing a word here
 * without changing it there leaves two sources of truth and no way to tell
 * which one was reviewed.
 *
 * The video is decoration, so it is aria-hidden and muted, and an ink wash sits
 * over it: white type on unmanaged video frames is a contrast lottery, and this
 * page has to stay readable on a phone in daylight. The wash is also what the
 * visitor sees while the file is still arriving, which is why the section
 * carries the same colour underneath rather than white.
 */
export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-ink"
    >
      <video
        className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
        tabIndex={-1}
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* The wash runs left to right, not top to bottom. The runner sits centre
          right in frame, so a vertical gradient put its lightest band exactly
          behind the headline and let the type collide with her face. Dark on
          the left where the words live, clear on the right where she does. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/60 to-ink/10"
      />
      {/* A little extra at the foot, so the secondary line keeps its contrast
          over whatever frame happens to be playing. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/70 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-[1600px] px-5 pb-16 pt-32 sm:px-10 sm:pb-20 lg:px-[68px] lg:pb-24">
        <h1 className="heading-hero max-w-[92%] text-[clamp(3rem,11vw,8.5rem)] uppercase leading-[0.9] text-paper lg:max-w-[56%]">
          Runs you can&rsquo;t fake
        </h1>

        <p className="mt-6 max-w-[52ch] text-base text-paper/85 sm:mt-8 sm:text-lg">
          Sterun turns every race entry into a verified race record on Stellar. It stays bound to
          the runner who signed up, and it stays readable after the organiser is gone.
        </p>

        {/* No secondary line and no contracts link here. Both moved down to the
            Proof section: the hero's job is to say what this is, and the link
            asking a reader to go verify it lands better once they know what
            they would be verifying. The header's Launch app is the only thing
            to press on this screen. */}
      </div>
    </section>
  );
}
