import Link from "next/link";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/** Clients' own words. "preview" shows the first quote with a link to the rest. */
export function TestimonialsSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
  const preview = variant === "preview";
  const items = preview ? SITE.testimonials.slice(0, 1) : SITE.testimonials;
  return (
    <section
      className={sectionClass(tone)}
      aria-labelledby={page ? "page-title" : "testimonials-title"}
    >
      <div className="wrap">
        {page ? null : (
          <Heading id="testimonials-title" className={titleClass(headingLevel)}>
            What clients say
          </Heading>
        )}
        <ul className={preview ? "testimonial-list testimonial-list--preview" : "testimonial-list"}>
          {items.map((t) => (
            <li key={t.name} className="testimonial-card">
              <figure>
                <blockquote>
                  {t.quote.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </blockquote>
                <figcaption>{t.name}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
        {preview ? (
          <p className="section-more">
            <Link className="button button-secondary" href="/testimonials">
              Read more testimonials
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
