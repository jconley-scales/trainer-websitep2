import type { Metadata } from "next";
import { ContactSection } from "@/components/marketing/ContactSection";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Book your free first consultation. Email, call or send a message and we will find a time that suits you.",
};

export default function ContactPage() {
  return <ContactSection headingLevel="h1" />;
}
