import type { Metadata } from "next";
import { Big_Shoulders, Poppins } from "next/font/google";
import "./globals.css";

// Attention type. The landing hero and nothing else — a condensed face at 700
// carries a 64px headline and falls apart in a paragraph.
const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-big-shoulders",
  display: "swap",
});

// Everything else: section headings and the wordmark (italic, 500-600), and
// all body copy, forms, tables and digits (roman, 400-500). One family keeps
// the page coherent; the italic is what separates a heading from its text.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sterun — runs you can't fake",
  description: "Non-transferable race records for running events, on Stellar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bigShoulders.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
