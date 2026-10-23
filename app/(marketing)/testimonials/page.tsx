import type { Metadata } from "next";
import { ConsultCta } from "@/components/marketing/ConsultCta";
import { PageHeader } from "@/components/marketing/PageHeader";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Testimonials",
  description:
    "Kind words from clients who started training later in life and now feel stronger, steadier and more confident.",
};

export default function TestimonialsPage() {
  return (
    <>
      <PageHeader
        title="Kind words from clients"
        lead={`What it is like to train with ${SITE.trainerFirstName}.`}
      />
      <TestimonialsSection page />
      <ConsultCta />
    </>
  );
}
