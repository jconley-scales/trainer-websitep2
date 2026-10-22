import { AboutSection } from "@/components/marketing/AboutSection";
import { ContactSection } from "@/components/marketing/ContactSection";
import { Hero } from "@/components/marketing/Hero";
import { ServicesSection } from "@/components/marketing/ServicesSection";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";

/**
 * Home: a short landing page. Each section is a preview that links to its own
 * page (/services, /about, /testimonials, /contact).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <ServicesSection variant="preview" />
      <AboutSection variant="preview" tone="alt" />
      <TestimonialsSection variant="preview" />
      <ContactSection variant="preview" tone="alt" />
    </>
  );
}
