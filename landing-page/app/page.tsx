import { ClosingCta } from "@/modules/closing-cta/ClosingCta";
import { Hero } from "@/modules/hero/Hero";
import { HowItWorks } from "@/modules/how-it-works/HowItWorks";
import { ProductPreview } from "@/modules/product-preview/ProductPreview";
import { Problem } from "@/modules/problem/Problem";
import { WhyStellar } from "@/modules/why-stellar/WhyStellar";
import { WhyStellarTrack } from "@/modules/why-stellar/WhyStellarTrack";

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <ProductPreview />
      <WhyStellar />
      <WhyStellarTrack />
      <ClosingCta />
    </>
  );
}
