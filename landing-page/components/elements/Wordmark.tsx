import Image from "next/image";

/**
 * The lockup, cropped to its own artwork.
 *
 * sterun-lockup-*.svg carries generous padding inside its 1245x400 viewBox:
 * measured, the art occupies x 54..1136 and y 82..308, so it fills only 56% of
 * the box height. Rendered in a 48px box the wordmark comes out a 27px sliver,
 * which is why the header read as empty beside a 30px MENU.
 *
 * Rather than edit the shared asset — fe/ renders the same file, and
 * docs/brand.md documents that padding as the clear-space rule — the crop lives
 * here: the image is scaled to 400/226 = 1.77x the wanted optical height, then
 * pulled up and left so the art starts at the container's edge. overflow-hidden
 * clips the padding.
 *
 * Numbers, at a 40px optical wordmark: image 71x221, art inset 15px from the
 * top and 10px from the left. The 30px mobile set is the same ratios.
 *
 * If the SVG is ever re-exported tight, delete this and render the file plain.
 */
export function Wordmark({ variant = "white" }: { variant?: "white" | "black" }) {
  return (
    <span className="relative block h-[30px] w-[143px] overflow-hidden sm:h-10 sm:w-[192px]">
      <Image
        src={`/brand/logo/sterun-lockup-${variant}.svg`}
        alt="Sterun"
        width={221}
        height={71}
        priority
        className="absolute -left-[7px] -top-[11px] h-[53px] w-[165px] max-w-none sm:-left-[10px] sm:-top-[15px] sm:h-[71px] sm:w-[221px]"
      />
    </span>
  );
}
