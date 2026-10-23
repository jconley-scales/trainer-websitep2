import type { Metadata } from "next";
import { PageHeader } from "@/components/marketing/PageHeader";
import { ServicesSection } from "@/components/marketing/ServicesSection";

export const metadata: Metadata = {
  title: "Services and pricing",
  description:
    "One-to-one training, a six-session starter program and small-group sessions, with clear prices and a free first consultation.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Services and pricing"
        lead="Simple, friendly training with no pressure and no jargon."
      />
      <ServicesSection page />
    </>
  );
}
