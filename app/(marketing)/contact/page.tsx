import type { Metadata } from "next";
import { ContactSection } from "@/components/marketing/ContactSection";
import { PageHeader } from "@/components/marketing/PageHeader";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: `Send ${SITE.trainer} a message about personal training in Chittenden County, Vermont. ${SITE.assessmentNote}`,
};

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Get in touch" lead={SITE.contactIntro} />
      <ContactSection page />
    </>
  );
}
