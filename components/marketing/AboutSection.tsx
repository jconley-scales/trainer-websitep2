import Link from "next/link";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * About the trainer. "preview" shows the credentials and first paragraph with a
 * "Read more" link; "full" has the whole bio and philosophy.
 */
export function AboutSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
  const preview = variant === "preview";
  const paragraphs = preview ? SITE.about.slice(0, 1) : SITE.about;
  return (
    <section
      className={sectionClass(tone)}
      aria-labelledby={page ? "page-title" : "about-title"}
    >
      <div className="wrap about-grid">
        <div
          className="photo-placeholder"
          role="img"
          aria-label={`Photo of ${SITE.trainer} (coming soon)`}
        >
          <span className="photo-initials" aria-hidden="true">
            {SITE.initials}
          </span>
        </div>
        <div>
          {page ? null : (
            <>
              <Heading id="about-title" className={titleClass(headingLevel)}>
                About {SITE.trainerFirstName}
              </Heading>
              <p className="about-credentials">{SITE.credentials}</p>
            </>
          )}
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {preview ? (
            <p className="section-more">
              <Link className="button button-secondary" href="/about">
                Read more<span className="visually-hidden"> about {SITE.trainerFirstName}</span>
              </Link>
            </p>
          ) : (
            <p className="about-philosophy">{SITE.philosophy}</p>
          )}
        </div>
      </div>
    </section>
  );
}
