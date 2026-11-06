import type { Metadata } from "next";
import { AboutSection } from "@/components/marketing/AboutSection";
import { ConsultCta } from "@/components/marketing/ConsultCta";
import { PageHeader } from "@/components/marketing/PageHeader";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `About ${SITE.trainerFirstName}`,
  description: `Meet ${SITE.trainer}: former professional basketball player, ACE-certified personal trainer and senior fitness specialist in the Burlington, Vermont area.`,
};

export default function AboutPage() {
  return (
    <>
      <PageHeader title={`About ${SITE.trainerFirstName}`} lead={SITE.credentials} />
      <AboutSection page />
      <ConsultCta />
    </>
  );
}
