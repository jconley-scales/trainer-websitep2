import Link from "next/link";
import { buildMailto } from "@/lib/contact";
import { SITE } from "@/lib/site";
import { ContactForm } from "./ContactForm";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * Contact. "preview" is the home-page call to action that links to the contact
 * page; "full" has real email and phone links plus a message form that opens the
 * visitor's email app (no backend).
 */
export function ContactSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
}: SectionProps) {
  const Heading = headingLevel;
  const preview = variant === "preview";
  const mailto = buildMailto({ to: SITE.email, subject: "Free consultation" });
  return (
    <>
      <section className={sectionClass(tone)} aria-labelledby="contact-title">
        <div className="wrap contact-box">
          <Heading id="contact-title" className={titleClass(headingLevel)}>
            {preview ? "Let’s have a chat" : "Get in touch"}
          </Heading>
          <p className="section-intro">{SITE.contactIntro}</p>
          <div className="hero-actions contact-actions">
            {preview ? (
              <Link className="button button--accent button--lg" href="/contact">
                Get in touch<span className="visually-hidden"> with {SITE.trainerFirstName}</span>
              </Link>
            ) : (
              <a className="button button--accent button--lg" href={mailto}>
                Email {SITE.trainerFirstName}
              </a>
            )}
            <a className="button button-secondary button--lg" href={`tel:${SITE.phoneHref}`}>
              Call {SITE.phone}
            </a>
          </div>
          {preview ? null : (
            <p className="section-note">
              {SITE.email} &middot; {SITE.phone}
            </p>
          )}
        </div>
      </section>
      {preview ? null : (
        <section className="section section--alt">
          <div className="wrap">
            <ContactForm />
          </div>
        </section>
      )}
    </>
  );
}
