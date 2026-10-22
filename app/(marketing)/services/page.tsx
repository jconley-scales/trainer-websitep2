import type { Metadata } from "next";
import { ServicesSection } from "@/components/marketing/ServicesSection";

export const metadata: Metadata = {
  title: "Services and pricing",
  description:
    "One-to-one training, a six-session starter programme and small-group sessions, with clear prices and a free first consultation.",
};

export default function ServicesPage() {
  return <ServicesSection headingLevel="h1" />;
}
