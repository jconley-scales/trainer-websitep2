import Link from "next/link";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/** Number of quotes in the home-page preview. */
const PREVIEW_COUNT = 2;

/** Client quotes. "preview" shows the first couple with a link to the rest. */
export function TestimonialsSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
}: SectionProps) {
  const Heading = headingLevel;
  const preview = variant === "preview";
  const items = preview ? SITE.testimonials.slice(0, PREVIEW_COUNT) : SITE.testimonials;
  return (
    <section className={sectionClass(tone)} aria-labelledby="testimonials-title">
      <div className="wrap">
        <Heading id="testimonials-title" className={titleClass(headingLevel)}>
          Kind words from clients
        </Heading>
        <ul className="feature-grid">
          {items.map((t) => (
            <li key={t.name} className="testimonial-card">
              <figure>
                <blockquote>
                  <p>{t.quote}</p>
                </blockquote>
                <figcaption>
                  <strong>{t.name}</strong>
                  <span>{t.descriptor}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        {preview ? (
          <p className="section-more">
            <Link className="button button-secondary" href="/testimonials">
              More kind words<span className="visually-hidden"> from clients</span>
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
