import { AboutSection } from "@/components/marketing/AboutSection";
import { ContactSection } from "@/components/marketing/ContactSection";
import { Hero } from "@/components/marketing/Hero";
import { ServicesSection } from "@/components/marketing/ServicesSection";

/**
 * Home: a short landing page. Each section is a preview that links to its own
 * page (/services, /about, /contact).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <ServicesSection variant="preview" />
      <AboutSection variant="preview" tone="alt" />
      <ContactSection variant="preview" />
    </>
  );
}
