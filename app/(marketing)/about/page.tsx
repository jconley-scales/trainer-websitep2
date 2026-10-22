import type { Metadata } from "next";
import { AboutSection } from "@/components/marketing/AboutSection";
import { ConsultCta } from "@/components/marketing/ConsultCta";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `About ${SITE.trainerFirstName}`,
  description: `Meet ${SITE.trainer}: ${SITE.credentials}. Gentle, one-to-one personal training paced for you.`,
};

export default function AboutPage() {
  return (
    <>
      <AboutSection headingLevel="h1" />
      <ConsultCta />
    </>
  );
}
