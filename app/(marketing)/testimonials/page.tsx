import type { Metadata } from "next";
import { ConsultCta } from "@/components/marketing/ConsultCta";
import { PageHeader } from "@/components/marketing/PageHeader";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Testimonials",
  description: `What clients say about training with ${SITE.trainer}: stronger, steadier and more confident, at any age.`,
};

export default function TestimonialsPage() {
  return (
    <>
      <PageHeader
        title="What clients say"
        lead={`In their own words: what it is like to train with ${SITE.trainerFirstName}.`}
      />
      <TestimonialsSection page />
      <ConsultCta />
    </>
  );
}
