import Link from "next/link";
import { SITE } from "@/lib/site";
import { ContactForm } from "./ContactForm";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * Contact. "preview" is the home-page call to action that links to the contact
 * page; "full" is the message form, which emails the trainer from the server.
 */
export function ContactSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
  if (variant === "preview") {
    return (
      <section className={sectionClass(tone)} aria-labelledby="contact-title">
        <div className="wrap contact-box">
          <Heading id="contact-title" className={titleClass(headingLevel)}>
            Connect and get fit with My Older Fitness
          </Heading>
          <p className="section-intro">{SITE.contactIntro}</p>
          <div className="hero-actions contact-actions">
            <Link className="button button--accent button--lg" href="/contact">
              Get in touch<span className="visually-hidden"> with {SITE.trainerFirstName}</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section
      className={sectionClass(tone)}
      aria-labelledby={page ? "page-title" : "contact-title"}
    >
      <div className="wrap">
        {page ? null : (
          <Heading id="contact-title" className={titleClass(headingLevel)}>
            Get in touch
          </Heading>
        )}
        <ContactForm />
      </div>
    </section>
  );
}
