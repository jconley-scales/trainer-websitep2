import type { Metadata } from "next";
import { ConsultCta } from "@/components/marketing/ConsultCta";
import { PageHeader } from "@/components/marketing/PageHeader";
import { PricingSection } from "@/components/marketing/PricingSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Personal training session prices with ${SITE.trainer}: single sessions and 5, 10 and 15 session packages. ${SITE.assessmentNote}`,
};

export default function PricingPage() {
  return (
    <>
      <PageHeader title="Session prices" lead={SITE.assessmentNote} />
      <PricingSection page />
      <ConsultCta />
    </>
  );
}
