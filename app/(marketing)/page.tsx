import { AboutSection } from "@/components/marketing/AboutSection";
import { ContactSection } from "@/components/marketing/ContactSection";
import { Hero } from "@/components/marketing/Hero";
import { PhotoGallery } from "@/components/marketing/PhotoGallery";
import { PricingSection } from "@/components/marketing/PricingSection";
import { TestimonialsSection } from "@/components/marketing/TestimonialsSection";
import { GALLERY } from "@/lib/photos";

/**
 * Home: a landing page. Meet the trainer, see the prices, then the photos and
 * a client's words. Each section links to its own page (/about, /pricing,
 * /testimonials, /contact).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <AboutSection variant="preview" tone="alt" />
      <PricingSection variant="preview" />
      <PhotoGallery photos={GALLERY} tone="alt" />
      <TestimonialsSection variant="preview" />
      <ContactSection variant="preview" tone="alt" />
    </>
  );
}
