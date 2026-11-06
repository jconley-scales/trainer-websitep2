import { AboutSection } from "@/components/marketing/AboutSection";
import { ContactSection } from "@/components/marketing/ContactSection";
import { Hero } from "@/components/marketing/Hero";

/**
 * Home: a short landing page. Each section is a preview that links to its own
 * page (/about, /contact).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <AboutSection variant="preview" tone="alt" />
      <ContactSection variant="preview" />
    </>
  );
}
