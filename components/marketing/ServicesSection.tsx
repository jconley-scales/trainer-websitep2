import Link from "next/link";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * Services and pricing. "preview" is a compact list of names and prices that
 * links to the full page; "full" has every description, the pricing note and a
 * call to action.
 */
export function ServicesSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
  const CardHeading = page || headingLevel === "h1" ? "h2" : "h3";
  const preview = variant === "preview";
  return (
    <section
      className={sectionClass(tone)}
      aria-labelledby={page ? "page-title" : "services-title"}
    >
      <div className="wrap">
        {page ? null : (
          <>
            <Heading id="services-title" className={titleClass(headingLevel)}>
              {preview ? "What I offer" : "Services and pricing"}
            </Heading>
            <p className="section-intro">
              Simple, friendly training with no pressure and no jargon.
            </p>
          </>
        )}
        <ul className="feature-grid">
          {SITE.services.map((service) => (
            <li key={service.title} className="feature-card">
              <CardHeading>{service.title}</CardHeading>
              {preview ? null : <p>{service.blurb}</p>}
              <p className="feature-price">{service.price}</p>
            </li>
          ))}
        </ul>
        {preview ? (
          <p className="section-more">
            <Link className="button button-secondary" href="/services">
              See all services
            </Link>
          </p>
        ) : (
          <>
            <p className="section-note">
              Packages available &mdash; book a free consultation and we will
              find what suits you.
            </p>
            <p className="section-more">
              <Link className="button button--accent button--lg" href="/book">
                Book a session
              </Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
