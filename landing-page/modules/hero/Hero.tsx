/**
 * Encoded from the 9.4 MB 1920x1080 source down to 1600px, no audio track (the
 * element is muted, so the source's 316 kb/s AAC stream was pure dead weight):
 *   hero.webm  VP9 CRF 40   718 KB  — every current browser
 *   hero.mp4   H.264 CRF 28 1.4 MB  — fallback for older Safari
 *   hero-poster.webp        39 KB   — frame 0, painted before either arrives
 * The poster is the video's own first frame, so the swap to motion is seamless
 * rather than a jump from one picture to another.
 */
const VIDEO = {
  webm: "/videos/hero.webm",
  mp4: "/videos/hero.mp4",
  poster: "/videos/hero-poster.webp",
} as const;

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
      data-header-tone="dark"
      className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-ink"
    >
      {/* The still sits underneath and stays for reduced-motion users, who get
          the frame without the movement instead of a blank ink field.

          Both layers are anchored to the right edge on narrow screens. The
          footage is 16:9 with the runner's face in the last sixth of the frame
          (lens from 83%, nose at 97%). A portrait phone shows only about a
          quarter of the width: centred, that quarter was her hair; at 78% it
          was her ear. Anchored right it is the lens, nose and mouth. From
          640px up the frame is wide enough to centre again. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a full-bleed
          background with a known intrinsic size; next/image adds a wrapper and
          srcset machinery this single 39 KB file has no use for. */}
      <img
        src={VIDEO.poster}
        alt=""
        aria-hidden
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-right sm:object-center"
      />
      <video
        className="absolute inset-0 h-full w-full object-cover object-right motion-reduce:hidden sm:object-center"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={VIDEO.poster}
        aria-hidden
        tabIndex={-1}
      >
        {/* Order matters: the browser takes the first source it can play. */}
        <source src={VIDEO.webm} type="video/webm" />
        <source src={VIDEO.mp4} type="video/mp4" />
      </video>

      {/* The wash runs left to right, not top to bottom. The runner sits centre
          right in frame, so a vertical gradient put its lightest band exactly
          behind the headline and let the type collide with her face. Dark on
          the left where the words live, clear on the right where she does. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/60 to-ink/10"
      />
      {/* A little extra at the foot, so the subhead keeps its contrast over
          whatever frame happens to be playing. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/70 to-transparent"
      />

      <div className="relative mx-auto w-full max-w-[1600px] px-5 pb-16 pt-32 sm:px-10 sm:pb-20 lg:px-[68px] lg:pb-24">
        <h1 className="heading-hero max-w-[92%] text-balance text-[clamp(3rem,11vw,8.5rem)] uppercase leading-[0.9] text-paper lg:max-w-[56%]">
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
