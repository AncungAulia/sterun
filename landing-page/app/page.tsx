import { Hero } from "@/modules/hero/Hero";
import { HowItWorks } from "@/modules/how-it-works/HowItWorks";
import { ProductPreview } from "@/modules/product-preview/ProductPreview";
import { Problem } from "@/modules/problem/Problem";

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <ProductPreview />
    </>
  );
}
