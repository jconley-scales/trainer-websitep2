import type { Metadata } from "next";
import { ConsultCta } from "@/components/marketing/ConsultCta";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";

export const metadata: Metadata = {
  title: "Testimonials",
  description:
    "Kind words from clients who started training later in life and now feel stronger, steadier and more confident.",
};

export default function TestimonialsPage() {
  return (
    <>
      <TestimonialsSection headingLevel="h1" />
      <ConsultCta />
    </>
  );
}
