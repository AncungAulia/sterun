import type { Metadata } from "next";
import { Big_Shoulders, Poppins } from "next/font/google";

import { Header } from "@/components/layouts/Header";

import "./globals.css";
import { Providers } from "./providers";

/**
 * The two families tokens.css refers to. Self-hosted by next/font, so no
 * request leaves the visitor's browser at render time and the QR pass keeps its
 * type when the phone is offline.
 *
 * Poppins has no variable weight on Google Fonts, so the weights are listed.
 * 600 is the ceiling on purpose: 700 belongs to the hero face alone.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-poppins",
  display: "swap",
});

const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-big-shoulders",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sterun",
    template: "%s · Sterun",
  },
  description:
    "Find races, enter them, and keep a trusted record of every finish.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /**
     * suppressHydrationWarning is on <html> for one specific reason: Stellar
     * Wallets Kit writes its own --swk-* custom properties onto the document
     * element when it initialises, and that only ever happens on the client.
     * React then compares a server <html> with no style attribute against a
     * client one with thirty custom properties and reports a mismatch nobody
     * can act on.
     *
     * It suppresses the warning for this element's own attributes only, not for
     * its children, so a real mismatch inside the page still surfaces.
     */
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${poppins.variable} ${bigShoulders.variable}`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
